import { withSupabase } from 'npm:@supabase/server@1.5.3';
import type { Database } from '../_shared/database.types.ts';

const headers: Record<string, string> = { 'Content-Type': 'application/json' };
const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

export default {
  fetch: withSupabase<Database>(
    { auth: 'secret' },
    async (request, context) => {
      if (request.method !== 'POST')
        return new Response(null, { status: 405, headers: { Allow: 'POST' } });
      const admin = context.supabaseAdmin;
      const result = {
        accepted: 0,
        deliveredToProvider: 0,
        failed: 0,
        errors: [] as string[],
      };
      try {
        const { data, error } = await admin.rpc('claim_push_deliveries', {
          p_limit: 100,
        });
        if (error) throw error;
        const pending = data ?? [];
        if (pending.length) {
          let tickets: {
            status?: string;
            id?: string;
            message?: string;
            details?: { error?: string };
          }[] = [];
          let batchError = '';
          try {
            const response = await fetch(
              'https://exp.host/--/api/v2/push/send',
              {
                method: 'POST',
                headers,
                signal: AbortSignal.timeout(15_000),
                body: JSON.stringify(
                  pending.map((item) => ({
                    to: item.push_token,
                    ...(item.data && typeof item.data === 'object' && !Array.isArray(item.data) && item.data.type === 'tracking_control'
                      ? { contentAvailable: true }
                      : { title: item.title, body: item.body, channelId: item.kind, sound: 'default' }),
                    data: item.data,
                    ttl: Math.max(
                      0,
                      Math.min(
                        3600,
                        Math.floor(
                          (Date.parse(item.expires_at) - Date.now()) / 1000,
                        ),
                      ),
                    ),
                  })),
                ),
              },
            );
            const payload = await response.json();
            if (!response.ok) batchError = `Expo HTTP ${response.status}`;
            else if (Array.isArray(payload.data)) tickets = payload.data;
            else batchError = 'Respuesta Expo no válida';
          } catch (error) {
            batchError = error instanceof Error ? error.message : String(error);
          }
          if (batchError) result.errors.push(batchError);
          await Promise.all(
            pending.map(async (item, index) => {
              const ticket = tickets[index];
              const accepted = ticket?.status === 'ok' && !!ticket.id;
              const permanent = [
                'DeviceNotRegistered',
                'MessageTooBig',
                'InvalidCredentials',
                'MismatchSenderId',
              ].includes(ticket?.details?.error ?? '');
              const { error } = await admin
                .from('notification_deliveries')
                .update({
                  status: accepted
                    ? 'accepted'
                    : permanent || item.attempt_count >= 5
                      ? 'failed'
                      : 'pending',
                  ticket_id: accepted ? ticket.id : null,
                  lease_id: null,
                  claimed_at: null,
                  updated_at: new Date().toISOString(),
                  next_attempt_at: new Date(
                    Date.now() +
                      Math.min(3600_000, 30_000 * 2 ** item.attempt_count) +
                      Math.random() * 10_000,
                  ).toISOString(),
                  last_error: accepted
                    ? null
                    : ticket?.message || batchError || 'Ticket no recibido',
                })
                .eq('id', item.id)
                .eq('lease_id', item.lease_id)
                .eq('status', 'processing');
              if (error) throw error;
              if (ticket?.details?.error === 'DeviceNotRegistered') {
                const { error: tokenError } = await admin
                  .from('devices')
                  .update({ expo_push_token: null })
                  .eq('expo_push_token', item.push_token);
                if (tokenError) throw tokenError;
              }
              if (accepted) result.accepted += 1;
              else result.failed += 1;
            }),
          );
        }
        const { data: waiting, error: receiptError } = await admin
          .from('notification_deliveries')
          .select('id,ticket_id,push_token,updated_at,attempt_count')
          .eq('status', 'accepted')
          .lt('updated_at', new Date(Date.now() - 15 * 60_000).toISOString())
          .order('updated_at')
          .limit(100);
        if (receiptError) throw receiptError;
        if (waiting?.length) {
          const response = await fetch(
            'https://exp.host/--/api/v2/push/getReceipts',
            {
              method: 'POST',
              headers,
              signal: AbortSignal.timeout(15_000),
              body: JSON.stringify({
                ids: waiting.map((item) => item.ticket_id),
              }),
            },
          );
          if (!response.ok) throw new Error(`Receipts HTTP ${response.status}`);
          const payload = await response.json();
          await Promise.all(
            waiting.map(async (item) => {
              const receipt = item.ticket_id
                ? payload.data?.[item.ticket_id]
                : undefined;
              if (
                !receipt &&
                Date.parse(item.updated_at) > Date.now() - 24 * 3600_000
              )
                return;
              const delivered = receipt?.status === 'ok';
              const retry =
                [
                  'MessageRateExceeded',
                  'ExpoServerError',
                  'InternalServerError',
                ].includes(receipt?.details?.error) && item.attempt_count < 5;
              const { error } = await admin
                .from('notification_deliveries')
                .update({
                  status: delivered
                    ? 'delivered'
                    : retry
                      ? 'pending'
                      : 'failed',
                  ...(retry
                    ? {
                        ticket_id: null,
                        next_attempt_at: new Date(
                          Date.now() + 60_000 * 2 ** item.attempt_count,
                        ).toISOString(),
                      }
                    : {}),
                  receipt_checked_at: new Date().toISOString(),
                  last_error: delivered
                    ? null
                    : (receipt?.message ??
                      'Receipt no disponible tras 24 horas'),
                })
                .eq('id', item.id)
                .eq('status', 'accepted');
              if (error) throw error;
              if (receipt?.details?.error === 'DeviceNotRegistered') {
                const { error: tokenError } = await admin
                  .from('devices')
                  .update({ expo_push_token: null })
                  .eq('expo_push_token', item.push_token);
                if (tokenError) throw tokenError;
              }
              if (delivered) result.deliveredToProvider += 1;
              else result.failed += 1;
            }),
          );
        }
      } catch (error) {
        result.errors.push(
          error instanceof Error ? error.message : String(error),
        );
      }
      return Response.json(result, {
        status: result.errors.length ? 502 : 200,
      });
    },
  ),
};
