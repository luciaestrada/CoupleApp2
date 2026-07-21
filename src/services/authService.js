import { supabase } from '../supabase/client';

export async function createInviteCode(_userId, startDate) {
  const { data, error } = await supabase.rpc('create_couple_with_invite', {
    p_start_date: startDate || new Date().toISOString().slice(0, 10),
  });

  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  return result?.new_invite_code;
}

export async function joinWithInviteCode(inviteCode) {
  const { data, error } = await supabase.rpc('join_couple_by_code', {
    p_invite_code: inviteCode.trim().toUpperCase(),
  });

  if (error) throw error;
  return data;
}
