import * as Crypto from 'expo-crypto';
import { supabase } from '../supabase/client';
import { watchQuery } from './realtimeService';

function normalizeMessage(message) {
  return {
    id: message.id,
    senderId: message.sender_id,
    text: message.text,
    loveTap: message.type === 'love',
    type: message.type,
    metadata: message.metadata ?? {},
    createdAt: message.created_at,
  };
}

export function watchMessages(coupleId, handlers) {
  return watchQuery({
    channelName: `messages-${coupleId}`,
    table: 'messages',
    filter: `couple_id=eq.${coupleId}`,
    async load() {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('couple_id', coupleId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data.map(normalizeMessage);
    },
    reduce: (messages, payload) =>
      [
        normalizeMessage(payload.new),
        ...messages.filter((item) => item.id !== payload.new.id),
      ]
        .sort(
          (a, b) =>
            b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
        )
        .slice(0, 50),
    ...handlers,
  });
}

function pendingKey(userId) {
  return `coupleapp.chat.${userId}`;
}
export function getPendingMessages(userId) {
  try {
    return JSON.parse(localStorage.getItem(pendingKey(userId)) ?? '[]');
  } catch {
    return [];
  }
}
let flushing = false;
export async function retryPendingMessages(userId) {
  if (flushing) return;
  flushing = true;
  try {
    for (const message of getPendingMessages(userId)) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user.id !== userId) return;
      const { error } = await supabase.rpc('send_message_v2', {
        p_text: message.text,
        p_client_id: message.id,
        p_expected_user_id: userId,
        p_couple_id: message.coupleId,
      });
      if (error) throw error;
      localStorage.setItem(
        pendingKey(userId),
        JSON.stringify(
          getPendingMessages(userId).filter((item) => item.id !== message.id),
        ),
      );
    }
  } finally {
    flushing = false;
  }
}
export async function sendMessage(coupleId, text) {
  const trimmedText = text.trim();
  if (!trimmedText) throw new Error('El mensaje no puede estar vacío.');
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Vuelve a iniciar sesión.');
  const userId = session.user.id;
  const pending = getPendingMessages(userId);
  if (pending.length >= 20)
    throw new Error(
      'Hay 20 mensajes pendientes. Reintenta antes de añadir más.',
    );
  pending.push({
    id: Crypto.randomUUID(),
    text: trimmedText,
    coupleId,
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem(pendingKey(userId), JSON.stringify(pending));
  try {
    await retryPendingMessages(userId);
    return { queued: true, error: null };
  } catch (error) {
    return { queued: true, error };
  }
}
export async function loadOlderMessages(coupleId, cursor) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('couple_id', coupleId)
    .or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    )
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data.map(normalizeMessage);
}
