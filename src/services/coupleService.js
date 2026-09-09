import { supabase } from '../supabase/client';
import { watchQuery } from './realtimeService';

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
  const { data, error } = await supabase.rpc('create_couple', {
    p_start_date: startDate,
  });
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

export function watchMyCouple(userId, coupleId, handlers) {
  const profile = watchQuery({
    channelName: `couple-profile-${userId}`,
    table: 'profiles',
    filter: `id=eq.${userId}`,
    load: getMyCouple,
    ...handlers,
  });
  const members = watchQuery({
    channelName: `couple-members-${userId}-${coupleId ?? 'none'}`,
    table: 'couple_members',
    filter: coupleId ? `couple_id=eq.${coupleId}` : `user_id=eq.${userId}`,
    load: getMyCouple,
    ...handlers,
  });
  return () => {
    profile();
    members();
  };
}
