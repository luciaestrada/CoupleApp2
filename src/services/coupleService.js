import { supabase } from '../supabase/client';
import { createRealtimeChannel } from '../utils/realtimeChannel';

function normalizeCouple(couple) {
  return {
    id: couple.id,
    inviteCode: couple.inviteCode,
    startDate: couple.startDate,
    members: couple.members,
    streaks: couple.streaks,
  };
}

export async function getMyCouple() {
  const { data, error } = await supabase.rpc('get_my_couple');
  if (error) throw error;
  return data === null ? null : normalizeCouple(data);
}

export async function createCouple(startDate) {
  const { data, error } = await supabase.rpc('create_couple', { p_start_date: startDate });
  if (error) throw error;
  return data;
}

export async function joinCouple(inviteCode) {
  const { data, error } = await supabase.rpc('join_couple', {
    p_invite_code: inviteCode.trim().toUpperCase(),
  });
  if (error) throw error;
  return data;
}

export async function cancelPendingCouple() {
  const { error } = await supabase.rpc('cancel_pending_couple');
  if (error) throw error;
}

export function watchMyCouple(userId, coupleId, { onData, onError }) {
  let active = true;
  let revision = 0;

  async function refresh() {
    const currentRevision = ++revision;
    try {
      const nextCouple = await getMyCouple();
      if (active && currentRevision === revision) onData(nextCouple);
    } catch (error) {
      if (active && currentRevision === revision) onError(error);
    }
  }

  const membershipFilter = coupleId ? `couple_id=eq.${coupleId}` : `user_id=eq.${userId}`;
  let channel = createRealtimeChannel(
    supabase,
    `my-couple-${userId}-${coupleId ?? 'unpaired'}`
  )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'couple_members', filter: membershipFilter },
      refresh
    );

  if (coupleId) {
    channel = channel.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'couples', filter: `id=eq.${coupleId}` },
      refresh
    );
  }

  channel.subscribe((status, error) => {
    if (!active) return;

    if (status === 'SUBSCRIBED') {
      // También relee tras reconectar para no dejar el emparejamiento en un estado obsoleto.
      void refresh();
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      onError(error instanceof Error ? error : new Error(`Realtime terminó con estado ${status}.`));
    }
  });

  void refresh();

  return () => {
    active = false;
    revision += 1;
    void supabase.removeChannel(channel).catch(() => undefined);
  };
}
