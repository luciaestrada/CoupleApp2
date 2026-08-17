import { supabase } from '../supabase/client';
import { watchQuery } from './realtimeService';

function normalizeMessage(message) {
  return {
    id: message.id,
    senderId: message.sender_id,
    text: message.text,
    loveTap: message.type === 'love',
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
        .select('id,sender_id,type,text,created_at')
        .eq('couple_id', coupleId)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      return data.map(normalizeMessage);
    },
    ...handlers,
  });
}

export async function sendMessage(coupleId, text) {
  const trimmedText = text.trim();
  if (!trimmedText) throw new Error('El mensaje no puede estar vacío.');

  const { error } = await supabase.rpc('send_message', {
    p_couple_id: coupleId,
    p_text: trimmedText,
  });
  if (error) throw error;
}
