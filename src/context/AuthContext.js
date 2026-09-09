import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Linking } from 'react-native';
import { revokeDevice } from '../services/deviceService';
import { resetPushRegistration } from '../services/notificationService';
import { stopTracking } from '../features/location/trackingEngine';
import { registerGeofences } from '../services/locationTask';
import { supabase, startSupabaseAuthAutoRefresh } from '../supabase/client';
import { getProfile, watchProfile } from '../services/profileService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [recovering, setRecovering] = useState(false);
  const finishRecovery = useCallback(() => setRecovering(false), []);
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
      if (event === 'SIGNED_OUT') {
        setUserProfile(null);
        setRecovering(false);
      }
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
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
    let active = true;
    const receive = async (url) => {
      if (!url) return;
      const parsed = new URL(url);
      if (
        parsed.protocol !== 'coupleapp:' ||
        parsed.hostname !== 'auth' ||
        !['/recovery', '/callback'].includes(parsed.pathname)
      )
        return;
      const params = new URLSearchParams(
        parsed.hash.slice(1) || parsed.search.slice(1),
      );
      if (params.has('error_description'))
        throw new Error(params.get('error_description'));
      if (parsed.pathname === '/recovery' && active) setRecovering(true);
      let result;
      if (params.get('code'))
        result = await supabase.auth.exchangeCodeForSession(params.get('code'));
      else if (params.get('access_token') && params.get('refresh_token'))
        result = await supabase.auth.setSession({
          access_token: params.get('access_token'),
          refresh_token: params.get('refresh_token'),
        });
      else return;
      if (result.error) throw result.error;
    };
    const handle = (url) =>
      receive(url).catch((error) => {
        if (active) setError(error);
      });
    void Linking.getInitialURL().then((url) => {
      if (active) void handle(url);
    });
    const subscription = Linking.addEventListener(
      'url',
      ({ url }) => void handle(url),
    );
    return () => {
      active = false;
      subscription.remove();
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
  }, [session]);

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
      options: {
        data: { name: name.trim() },
        emailRedirectTo: 'coupleapp://auth/callback',
      },
    });
    if (error) throw error;
    return data;
  }, []);

  const signOut = useCallback(async () => {
    await Promise.allSettled([stopTracking(), registerGeofences([])]);
    let tokenError = null;
    try {
      if (session?.user?.id) await revokeDevice();
    } catch (error) {
      tokenError = error;
    }
    resetPushRegistration();
    localStorage.removeItem(`coupleapp.chat.${session?.user?.id}`);
    const { error: signOutError } = await supabase.auth.signOut({
      scope: 'local',
    });
    if (signOutError) throw signOutError;
    if (tokenError)
      throw new Error(
        'Sesión cerrada. No se pudo revocar el dispositivo en el servidor; revisa la conexión para retirar sus avisos.',
      );
  }, [session]);

  const refreshProfile = useCallback(
    () => loadProfile(session?.user?.id),
    [loadProfile, session?.user?.id],
  );
  const activeUserProfile =
    userProfile?.id === session?.user?.id ? userProfile : null;

  const value = useMemo(
    () => ({
      session,
      recovering,
      finishRecovery,
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
      recovering,
      finishRecovery,
      activeUserProfile,
      error,
      loading,
      refreshProfile,
      refreshSession,
      session,
      signIn,
      signOut,
      signUp,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider.');
  return context;
}
