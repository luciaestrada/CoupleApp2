import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceKey =
  Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const cronSecret = Deno.env.get('CRON_SECRET');
const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN');

if (!supabaseUrl || !serviceKey) {
  throw new Error('Faltan SUPABASE_URL o la clave de servicio en la Edge Function');
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (request) => {
  if (!cronSecret || request.headers.get('x-cron-secret') !== cronSecret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = {
    removedStories: 0,
    queuedSpecialDates: 0,
    sentNotifications: 0,
    failedNotifications: 0,
  };

  const { data: queuedCount, error: queueError } = await supabase.rpc(
    'queue_special_date_notifications'
  );
  if (queueError) throw queueError;
  result.queuedSpecialDates = queuedCount ?? 0;

  const { data: expiredStories, error: storiesError } = await supabase
    .from('stories')
    .select('id, image_path')
    .lte('expires_at', new Date().toISOString())
    .limit(100);
  if (storiesError) throw storiesError;

  if (expiredStories?.length) {
    const paths = expiredStories.map((story) => story.image_path);
    const ids = expiredStories.map((story) => story.id);
    const { error: removeError } = await supabase.storage.from('stories').remove(paths);
    if (removeError) throw removeError;
    const { error: deleteError } = await supabase.from('stories').delete().in('id', ids);
    if (deleteError) throw deleteError;
    result.removedStories = ids.length;
  }

  const { data: pending, error: pendingError } = await supabase
    .from('notifications')
    .select('id, user_id, title, body, attempt_count')
    .eq('status', 'pending')
    .lt('attempt_count', 5)
    .order('created_at')
    .limit(100);
  if (pendingError) throw pendingError;

  if (pending?.length) {
    const userIds = [...new Set(pending.map((notification) => notification.user_id))];
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, expo_push_token')
      .in('id', userIds);
    if (profilesError) throw profilesError;
    const tokens = new Map(profiles.map((profile) => [profile.id, profile.expo_push_token]));

    const deliverable = pending.filter((notification) => tokens.get(notification.user_id));
    const missingToken = pending.filter((notification) => !tokens.get(notification.user_id));

    await Promise.all(
      missingToken.map((notification) =>
        supabase
          .from('notifications')
          .update({ status: 'failed', last_error: 'El usuario no tiene token Expo Push' })
          .eq('id', notification.id)
      )
    );
    result.failedNotifications += missingToken.length;

    if (deliverable.length) {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (expoAccessToken) headers.Authorization = `Bearer ${expoAccessToken}`;

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers,
        body: JSON.stringify(
          deliverable.map((notification) => ({
            to: tokens.get(notification.user_id),
            title: notification.title,
            body: notification.body,
            sound: 'default',
          }))
        ),
      });
      const payload = await response.json();
      const tickets = Array.isArray(payload.data) ? payload.data : [];

      await Promise.all(
        deliverable.map((notification, index) => {
          const ticket = tickets[index];
          const sent = response.ok && ticket?.status === 'ok';
          if (sent) result.sentNotifications += 1;
          else result.failedNotifications += 1;
          return supabase
            .from('notifications')
            .update({
              status: sent ? 'sent' : notification.attempt_count >= 4 ? 'failed' : 'pending',
              attempt_count: notification.attempt_count + 1,
              sent_at: sent ? new Date().toISOString() : null,
              last_error: sent ? null : ticket?.message || `Expo Push HTTP ${response.status}`,
            })
            .eq('id', notification.id);
        })
      );
    }
  }

  return Response.json(result);
});
