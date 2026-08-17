import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, startSupabaseAuthAutoRefresh } from '../supabase/client';
import { getProfile, watchProfile } from '../services/profileService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setUserProfile(null);
      setError(null);
      return;
    }
    const profile = await getProfile(userId);
    setUserProfile(profile);
    setError(null);
  }, []);

  const refreshSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      setSession(data.session);
      if (data.session?.user?.id) {
        await loadProfile(data.session.user.id);
      } else {
        setUserProfile(null);
      }
      return data.session;
    } catch (nextError) {
      setError(nextError);
      throw nextError;
    } finally {
      setLoading(false);
    }
  }, [loadProfile]);

  useEffect(() => {
    let mounted = true;

    const stopAutoRefresh = startSupabaseAuthAutoRefresh();
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return;
      if (sessionError) {
        setError(sessionError);
      } else {
        setSession(data.session);
      }
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT') setUserProfile(null);
      setSession(nextSession);
      setError(null);
    });

    return () => {
      mounted = false;
      stopAutoRefresh();
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return undefined;

    return watchProfile(userId, {
      onData: (profile) => {
        setUserProfile(profile);
        setError(null);
      },
      onError: setError,
    });
  }, [session?.user?.id]);

  const signIn = useCallback(async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
    return data;
  }, []);

  const signUp = useCallback(async ({ email, password, name }) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim() } },
    });
    if (error) throw error;
    return data;
  }, []);

  const signOut = useCallback(async () => {
    // Evita que un dispositivo compartido siga recibiendo avisos de la cuenta saliente.
    // El cierre de sesión se intenta incluso si la limpieza remota falla.
    const { error: tokenError } = session?.user?.id
      ? await supabase.rpc('set_push_token', { p_token: null })
      : { error: null };
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;
    if (tokenError) {
      throw new Error(
        `La sesión se cerró, pero no se pudo retirar el token de notificaciones: ${tokenError.message}`
      );
    }
  }, [session?.user?.id]);

  const refreshProfile = useCallback(
    () => loadProfile(session?.user?.id),
    [loadProfile, session?.user?.id]
  );
  const activeUserProfile = userProfile?.id === session?.user?.id ? userProfile : null;

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      userProfile: activeUserProfile,
      loading,
      error,
      signIn,
      signUp,
      signOut,
      refreshSession,
      refreshProfile,
    }),
    [
      activeUserProfile,
      error,
      loading,
      refreshProfile,
      refreshSession,
      session,
      signIn,
      signOut,
      signUp,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider.');
  return context;
}
