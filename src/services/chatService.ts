import * as Crypto from 'expo-crypto';
import { AppState } from 'react-native';
import { supabase } from '../supabase/client';
import { watchQuery } from './realtimeService';
import { createOutbox } from '../persistence/outbox';
import { createMessageDelivery } from '../features/chat/delivery';
import { asError } from '../utils/errors';
import type { Handlers, Message, Row } from '../types/domain';

function normalizeMessage(message: Row<'messages'>): Message {
  return { id: message.id, senderId: message.sender_id, text: message.text, loveTap: message.type === 'love',
    type: message.type, metadata: message.metadata && typeof message.metadata === 'object' && !Array.isArray(message.metadata) ? message.metadata : {}, createdAt: message.created_at };
}
export async function loadOlderMessages(coupleId: string, cursor: Message | null = null): Promise<Message[]> {
  let query = supabase.from('messages').select('*').eq('couple_id', coupleId)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(50);
  if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
  const { data, error } = await query;
  if (error) throw error;
  return data.map(normalizeMessage);
}
export function watchMessages(coupleId: string, handlers: Handlers<Message[]>) {
  return watchQuery({ channelName: `messages-${coupleId}`, table: 'messages', filter: `couple_id=eq.${coupleId}`,
    load: () => loadOlderMessages(coupleId), ...handlers });
}
const outbox = createOutbox();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach(listener => listener());
const delivery = createMessageDelivery({ outbox,
  currentUser: async () => (await supabase.auth.getSession()).data.session?.user.id ?? null,
  async send(userId, message) {
    const { error } = await supabase.rpc('send_message_v2', { p_text: message.text, p_client_id: message.id,
      p_expected_user_id: userId, p_couple_id: message.coupleId });
    if (error) throw error;
  },
});
export const invalidateMessageDelivery = () => delivery.invalidate();
export const getPendingMessages = (userId: string, coupleId: string) => outbox.read(userId, coupleId);
export function watchPendingMessages(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function discardPendingMessage(userId: string, coupleId: string, id: string) {
  outbox.update(userId, coupleId, id, null); changed();
}
export async function retryPendingMessages(userId: string, coupleId: string, includeFailed = false) {
  if (includeFailed) for (const message of outbox.read(userId, coupleId)) {
    if (message.state === 'failed') outbox.update(userId, coupleId, message.id, { state: 'pending', error: undefined });
  }
  try { await delivery.flush(userId, coupleId); } finally { changed(); }
}
export async function sendMessage(coupleId: string, text: string) {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 2000) throw new Error('El mensaje debe contener entre 1 y 2000 caracteres.');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Vuelve a iniciar sesión.');
  const pending = outbox.read(session.user.id, coupleId);
  if (pending.length >= 20) throw new Error('Hay 20 mensajes pendientes. Reintenta o descarta alguno.');
  pending.push({ id: Crypto.randomUUID(), coupleId, text: trimmed, createdAt: new Date().toISOString(), state: 'pending' });
  outbox.write(session.user.id, coupleId, pending); changed();
  try { await retryPendingMessages(session.user.id, coupleId); return { queued: true, error: null }; }
  catch (error) { return { queued: true, error: asError(error) }; }
}
export function startMessageRetry(userId: string, coupleId: string) {
  let active = true, failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    clearTimeout(timer);
    if (!active || AppState.currentState !== 'active') return;
    try { await retryPendingMessages(userId, coupleId); failures = 0; }
    catch { failures++; }
    if (active && AppState.currentState === 'active') timer = setTimeout(() => void run(), Math.min(300_000, 5000 * 2 ** Math.min(failures, 6)));
  };
  void run();
  const app = AppState.addEventListener('change', state => { clearTimeout(timer); if (state === 'active') void run(); });
  return () => { active = false; clearTimeout(timer); app.remove(); delivery.invalidate(); };
}
