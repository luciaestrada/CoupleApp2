import { supabase } from '../supabase/client';
import { watchQuery } from './realtimeService';
import { isRecord } from '../persistence/storage';
import type { Couple, Handlers, Streak } from '../types/domain';

function isStreak(value: unknown): value is Streak {
  return isRecord(value) && typeof value.userId === 'string' && typeof value.count === 'number'
    && (value.lastConfirmedDay === null || typeof value.lastConfirmedDay === 'string');
}
function normalizeCouple(couple: unknown): Couple {
  if (!isRecord(couple) || typeof couple.id !== 'string' || typeof couple.startDate !== 'string'
      || !(couple.inviteCode === null || typeof couple.inviteCode === 'string')
      || !Array.isArray(couple.members) || !couple.members.every((id): id is string => typeof id === 'string')
      || !Array.isArray(couple.streaks) || !couple.streaks.every(isStreak)) {
    throw new Error('El servidor devolvió una pareja inválida. Comprueba las migraciones del backend.');
  }
  return {
    id: couple.id,
    inviteCode: couple.inviteCode,
    startDate: couple.startDate,
    members: couple.members,
    streaks: couple.streaks,
  };
}

export async function getMyCouple(): Promise<Couple | null> {
  const { data, error } = await supabase.rpc('get_my_couple');
  if (error) throw error;
  return data === null ? null : normalizeCouple(data);
}

export async function createCouple(startDate: string) {
  const { data, error } = await supabase.rpc('create_couple', {
    p_start_date: startDate,
  });
  if (error) throw error;
  return data;
}

export async function joinCouple(inviteCode: string) {
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

export function watchMyCouple(userId: string, coupleId: string | null | undefined, handlers: Handlers<Couple | null>) {
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
