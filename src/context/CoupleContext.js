import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabase/client';
import { useAuth } from './AuthContext';

const CoupleContext = createContext(null);

function normalizeCouple(couple, members) {
  if (!couple) return null;
  return {
    id: couple.id,
    inviteCode: couple.invite_code,
    startDate: couple.start_date,
    members: members.map((member) => member.user_id),
    streak: {
      count: couple.streak_count || 0,
      lastConfirmedDay: couple.last_completed_date,
    },
  };
}

export function CoupleProvider({ children }) {
  const { user } = useAuth();
  const [couple, setCouple] = useState(null);
  const [loading, setLoading] = useState(false);

  const refreshCouple = useCallback(async () => {
    if (!user?.id) {
      setCouple(null);
      setLoading(false);
      return null;
    }

    setLoading(true);
    try {
      const { data: membership, error: membershipError } = await supabase
        .from('couple_members')
        .select('couple_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (membershipError) throw membershipError;
      if (!membership) {
        setCouple(null);
        return null;
      }

      const [{ data: coupleData, error: coupleError }, { data: members, error: membersError }] =
        await Promise.all([
          supabase.from('couples').select('*').eq('id', membership.couple_id).single(),
          supabase.from('couple_members').select('user_id').eq('couple_id', membership.couple_id),
        ]);

      if (coupleError) throw coupleError;
      if (membersError) throw membersError;

      const normalized = normalizeCouple(coupleData, members || []);
      setCouple(normalized);
      return normalized;
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    refreshCouple().catch((error) => console.error('No se pudo cargar la pareja:', error));
  }, [refreshCouple]);

  useEffect(() => {
    if (!user?.id) return undefined;

    let channel = supabase.channel(`couple-context-${user.id}-${couple?.id || 'unpaired'}`).on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'couple_members',
        filter: `user_id=eq.${user.id}`,
      },
      () => refreshCouple().catch(console.error)
    );

    if (couple?.id) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'couples', filter: `id=eq.${couple.id}` },
        () => refreshCouple().catch(console.error)
      );
    }

    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [couple?.id, refreshCouple, user?.id]);

  return (
    <CoupleContext.Provider value={{ couple, loading, refreshCouple }}>
      {children}
    </CoupleContext.Provider>
  );
}

export const useCouple = () => useContext(CoupleContext);
