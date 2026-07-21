import { supabase } from '../supabase/client';

function normalizeMessage(message) {
  return {
    id: message.id,
    senderId: message.sender_id,
    text: message.text,
    loveTap: message.type === 'love',
    createdAt: message.created_at,
  };
}

export function watchMessages(coupleId, onChange) {
  let active = true;

  async function loadMessages() {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('couple_id', coupleId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    if (active) onChange((data || []).map(normalizeMessage));
  }

  loadMessages().catch(console.error);
  const channel = supabase
    .channel(`messages-${coupleId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'messages', filter: `couple_id=eq.${coupleId}` },
      () => loadMessages().catch(console.error)
    )
    .subscribe();

  return () => {
    active = false;
    supabase.removeChannel(channel);
  };
}

export async function sendMessage(coupleId, userId, text) {
  const trimmedText = text.trim();
  if (!trimmedText) return;

  const { error } = await supabase.from('messages').insert({
    couple_id: coupleId,
    sender_id: userId,
    type: 'text',
    text: trimmedText,
  });
  if (error) throw error;
}

export async function sendLoveTap(coupleId) {
  const { error } = await supabase.rpc('send_love', { p_couple_id: coupleId });
  if (error) throw error;
}
