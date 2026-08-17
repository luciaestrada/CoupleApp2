import { withSupabase } from 'npm:@supabase/server';

const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN');

type MaintenanceResult = {
  removedStories: number;
  sentNotifications: number;
  failedNotifications: number;
  errors: string[];
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function resultResponse(result: MaintenanceResult, failureStatus = 500) {
  return Response.json(result, { status: result.errors.length > 0 ? failureStatus : 200 });
}

export default {
  fetch: withSupabase({ auth: 'secret' }, async (request, context) => {
    if (request.method !== 'POST') {
      return Response.json(
        { error: 'Método no permitido' },
        { status: 405, headers: { Allow: 'POST' } }
      );
    }

    const admin = context.supabaseAdmin;
    const result: MaintenanceResult = {
      removedStories: 0,
      sentNotifications: 0,
      failedNotifications: 0,
      errors: [],
    };

    try {
      const { data: expiredStories, error: storiesError } = await admin
        .from('stories')
        .select('id,image_path')
        .lte('expires_at', new Date().toISOString())
        .order('expires_at')
        .limit(100);
      if (storiesError) throw storiesError;

      const storiesToRemove = expiredStories ?? [];
      if (storiesToRemove.length > 0) {
        const paths = storiesToRemove.map((story) => story.image_path);
        const ids = storiesToRemove.map((story) => story.id);
        const { error: removeError } = await admin.storage.from('stories').remove(paths);
        if (removeError) throw removeError;

        const { error: deleteError } = await admin.from('stories').delete().in('id', ids);
        if (deleteError) throw deleteError;
        result.removedStories = ids.length;
      }
    } catch (error) {
      result.errors.push(`No se pudieron limpiar las historias: ${errorMessage(error)}`);
    }

    const { data: pendingData, error: pendingError } = await admin.rpc(
      'claim_pending_notifications',
      { p_limit: 100 }
    );
    if (pendingError) throw pendingError;

    const pending = pendingData ?? [];
    if (pending.length === 0) return resultResponse(result);

    const userIds = [...new Set(pending.map((notification) => notification.user_id))];
    const { data: pushTokens, error: pushTokensError } = await admin
      .from('push_tokens')
      .select('user_id,expo_push_token')
      .in('user_id', userIds);
    if (pushTokensError) throw pushTokensError;

    const tokens = new Map(
      (pushTokens ?? []).map((pushToken) => [pushToken.user_id, pushToken.expo_push_token])
    );
    const deliverable = pending.filter((notification) => tokens.get(notification.user_id));
    const missingToken = pending.filter((notification) => !tokens.get(notification.user_id));

    async function updateNotification(
      notificationId: string,
      changes: Record<string, string | number | null>
    ) {
      const { error } = await admin.from('notifications').update(changes).eq('id', notificationId);
      if (error) throw error;
    }

    await Promise.all(
      missingToken.map((notification) =>
        updateNotification(notification.id, {
          status: notification.attempt_count >= 5 ? 'failed' : 'pending',
          claimed_at: null,
          last_error: 'El usuario no tiene token Expo Push',
        })
      )
    );
    result.failedNotifications += missingToken.length;

    if (deliverable.length === 0) return resultResponse(result);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (expoAccessToken) headers.Authorization = `Bearer ${expoAccessToken}`;

    let response: Response;
    try {
      response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers,
        body: JSON.stringify(
          deliverable.map((notification) => ({
            to: tokens.get(notification.user_id),
            title: notification.title,
            body: notification.body,
            sound: 'default',
            channelId: 'default',
          }))
        ),
      });
    } catch (error) {
      const message = errorMessage(error);
      await Promise.all(
        deliverable.map((notification) =>
          updateNotification(notification.id, {
            status: notification.attempt_count >= 5 ? 'failed' : 'pending',
            claimed_at: null,
            last_error: `No se pudo contactar con Expo Push: ${message}`,
          })
        )
      );
      result.failedNotifications += deliverable.length;
      result.errors.push(`No se pudo contactar con Expo Push: ${message}`);
      return resultResponse(result, 502);
    }

    const payload = await response.json().catch(() => ({}));
    const tickets = Array.isArray(payload.data) ? payload.data : [];

    await Promise.all(
      deliverable.map(async (notification, index) => {
        const ticket = tickets[index];
        const sent = response.ok && ticket?.status === 'ok';

        if (sent) result.sentNotifications += 1;
        else result.failedNotifications += 1;

        await updateNotification(notification.id, {
          status: sent ? 'sent' : notification.attempt_count >= 5 ? 'failed' : 'pending',
          claimed_at: null,
          sent_at: sent ? new Date().toISOString() : null,
          last_error: sent
            ? null
            : ticket?.message ?? `Expo Push respondió HTTP ${response.status}`,
        });
      })
    );

    if (!response.ok) {
      result.errors.push(`Expo Push respondió HTTP ${response.status}`);
    }
    return resultResponse(result, 502);
  }),
};
