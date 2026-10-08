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
import { configureBackgroundNotifications } from '../services/backgroundNotificationService';
import { stopTracking } from '../features/location/trackingEngine';
import { registerGeofences } from '../services/locationTask';
import { supabase, startSupabaseAuthAutoRefresh } from '../supabase/client';
import { getProfile, watchProfile } from '../services/profileService';
import { invalidateMessageDelivery } from '../services/chatService';
import { clearStoryFiles } from '../services/storiesService';
import { clearAccountContent } from '../persistence/storage';
import { asError, type AppError } from '../utils/errors';
import type { Session, User } from '@supabase/supabase-js';
import type { Profile } from '../types/domain';

interface Credentials { email: string; password: string }
interface AuthState {
  session: Session | null; user: User | null; userProfile: Profile | null;
  recovering: boolean; finishRecovery(): void; loading: boolean; error: AppError | null;
  signIn(credentials: Credentials): Promise<Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>['data']>;
  signUp(credentials: Credentials & { name: string }): Promise<Awaited<ReturnType<typeof supabase.auth.signUp>>['data']>;
  signOut(): Promise<void>; refreshSession(): Promise<Session | null>; refreshProfile(): Promise<void>;
}
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: React.PropsWithChildren) {
  const [recovering, setRecovering] = useState(false);
  const finishRecovery = useCallback(() => setRecovering(false), []);
  const [session, setSession] = useState<Session | null>(null);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);

  const loadProfile = useCallback(async (userId: string | undefined) => {
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
      setError(asError(nextError));
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
    }).catch((nextError) => {
      if (!mounted) return;
      setError(asError(nextError));
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
    const receive = async (url: string | null) => {
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
        throw new Error(params.get('error_description') ?? 'No se pudo abrir el enlace.');
      if (parsed.pathname === '/recovery' && active) setRecovering(true);
      let result;
      const code = params.get('code');
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (code)
        result = await supabase.auth.exchangeCodeForSession(code);
      else if (accessToken && refreshToken)
        result = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      else return;
      if (result.error) throw result.error;
    };
    const handle = (url: string | null) =>
      receive(url).catch((error) => {
        if (active) setError(asError(error));
      });
    void Linking.getInitialURL().then((url) => {
      if (active) void handle(url);
    }).catch((error: unknown) => { if (active) setError(asError(error)); });
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

  const signIn = useCallback(async ({ email, password }: Credentials) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
    return data;
  }, []);

  const signUp = useCallback(async ({ email, password, name }: Credentials & { name: string }) => {
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
    const userId = session?.user.id;
    invalidateMessageDelivery();
    let storageError: unknown = null;
    try { if (userId) clearAccountContent(userId); }
    catch (error) { storageError = error; }
    await Promise.allSettled([
      configureBackgroundNotifications(null), stopTracking(), registerGeofences([]),
      ...(userId ? [clearStoryFiles(userId)] : []),
    ]);
    let tokenError: unknown = null;
    try {
      if (userId) await revokeDevice();
    } catch (error) {
      tokenError = error;
    }
    resetPushRegistration();
    const { error: signOutError } = await supabase.auth.signOut({
      scope: 'local',
    });
    if (signOutError) throw signOutError;
    if (storageError) throw new Error('Sesión cerrada. No se pudieron limpiar los datos locales de la cuenta.');
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
