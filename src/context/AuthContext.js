import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabase/client';

const AuthContext = createContext(null);

function normalizeProfile(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    name: profile.name,
    avatarUrl: profile.avatar_url,
    expoPushToken: profile.expo_push_token,
    status: {
      text: profile.status_text,
      emoji: profile.status_emoji,
      updatedAt: profile.status_updated_at,
    },
  };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setUserProfile(null);
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    setUserProfile(normalizeProfile(data));
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) console.error('No se pudo restaurar la sesión:', error);
      setSession(data?.session || null);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) setSession(nextSession);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setUserProfile(null);
      return undefined;
    }

    loadProfile(userId).catch((error) => console.error('No se pudo cargar el perfil:', error));

    const channel = supabase
      .channel(`profile-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        () => loadProfile(userId).catch(console.error)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadProfile, session?.user?.id]);

  async function signIn({ email, password }) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
    return data;
  }

  async function signUp({ email, password, name }) {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim() } },
    });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user || null,
        userProfile,
        loading,
        signIn,
        signUp,
        signOut,
        refreshProfile: () => loadProfile(session?.user?.id),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
