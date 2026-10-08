import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import { supabase } from '../supabase/client';
import {
  getNotificationPermission,
  requestNotificationPermission,
} from './permissionService';
import { registerDevice } from './deviceService';
import { navigationRef } from '../navigation/navigationService';
import { watchQuery } from './realtimeService';
import { syncLocalNotifications } from './localNotificationSync';
import { configureBackgroundNotifications } from './backgroundNotificationService';

let registered = null;
let failedRegistration = null;
let pushStatus = {
  status: 'unknown',
  message: 'Comprueba la recepción de avisos.',
};
export function getPushStatus() {
  return pushStatus;
}
const statusListeners = new Set();
function setPushStatus(value) {
  pushStatus = value;
  for (const listener of statusListeners) listener(value);
}
export function watchPushStatus(listener) {
  statusListeners.add(listener);
  listener(pushStatus);
  return () => { statusListeners.delete(listener); };
}
let registration;
let pendingResponse = null;
const routes = new Set([
  'Inicio',
  'Preguntas',
  'Chat',
  'Mapa',
  'Fechas',
  'Historias',
  'Estado',
  'Avisos',
  'Planes',
]);
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    if (notification.request.content.data?.type === 'tracking_control')
      return { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
    const route = navigationRef.isReady()
      ? navigationRef.getCurrentRoute()?.name
      : null;
    const duplicateChat =
      AppState.currentState === 'active' &&
      route === 'Chat' &&
      notification.request.content.data?.screen === 'Chat';
    return {
      shouldShowBanner: !duplicateChat,
      shouldShowList: true,
      shouldPlaySound: !duplicateChat,
      shouldSetBadge: false,
    };
  },
});
export function resetPushRegistration() {
  registered = null;
  failedRegistration = null;
  setPushStatus({
    status: 'unknown',
    message: 'Comprueba la recepción de avisos.',
  });
  pendingResponse = null;
}
export async function registerForPushNotifications({
  requestPermission = false,
  force = false,
} = {}) {
  if (registration) return registration;
  registration = (async () => {
    if (Platform.OS === 'android') {
      for (const [id, name] of [
        ['default', 'Avisos'],
        ['chat', 'Mensajes'],
        ['love', 'Amor'],
        ['geofence', 'Llegadas'],
        ['exit', 'Salidas'],
        ['walking', 'Caminar'],
        ['cycling', 'Bicicleta'],
        ['driving', 'Vehículo'],
        ['stationary', 'En reposo'],
        ['trip', 'Recorridos'],
        ['dates', 'Fechas'],
        ['stories', 'Historias'],
        ['status', 'Estados'],
        ['live', 'Solicitudes de ubicación'],
      ]) {
        await Notifications.setNotificationChannelAsync(id, {
          name,
          importance:
            id === 'chat'
              ? Notifications.AndroidImportance.HIGH
              : Notifications.AndroidImportance.DEFAULT,
        });
      }
    }
    let permission = await getNotificationPermission();
    if (!permission.granted && requestPermission && permission.canAskAgain)
      permission = await requestNotificationPermission();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return { status: 'denied', permission };
    if (
      !force &&
      permission.granted &&
      failedRegistration?.userId === session.user.id &&
      Date.now() - failedRegistration.at < 300000
    )
      throw new Error(pushStatus.message);
    if (
      !force &&
      registered?.userId === session.user.id &&
      registered.granted === permission.granted &&
      Date.now() - registered.at < 6 * 3600_000
    )
      return {
        status: permission.granted ? (Platform.OS === 'ios' ? 'local' : 'registered') : 'denied',
        permission,
      };
    // iOS uses the authenticated inbox and local notifications, without APNs.
    if (Platform.OS === 'ios') {
      await registerDevice(null);
      await configureBackgroundNotifications(session.user.id);
      localStorage.removeItem('coupleapp.pushToken');
      registered = { userId: session.user.id, granted: permission.granted, at: Date.now() };
      failedRegistration = null;
      setPushStatus({
        status: permission.granted ? 'local' : 'denied',
        message: permission.granted
          ? 'Avisos locales activados. Se consultan también en segundo plano cuando iOS lo permite. Los recordatorios de fechas y planes aparecen a las 09:00, hora de Madrid. La recepción de mensajes puede retrasarse.'
          : 'Permite las notificaciones en Ajustes para mostrar los avisos locales.',
      });
      return { status: pushStatus.status, token: null, permission };
    }
    let token = permission.granted
      ? localStorage.getItem('coupleapp.pushToken')
      : null;
    await registerDevice(token);
    if (permission.granted) {
      const projectId =
        Constants.easConfig?.projectId ??
        Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) {
        setPushStatus({ status: 'configuration_required', message: 'Esta instalación no tiene configurado el proyecto de notificaciones. Necesita una nueva versión con la configuración completa.' });
        throw new Error(pushStatus.message);
      }
      try {
        token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      } catch (error) {
        failedRegistration = { userId: session.user.id, at: Date.now() };
        const missingConfiguration =
          /firebase|google.?services|default.*app|fcm/i.test(
            error.message ?? '',
          );
        setPushStatus({
          status: missingConfiguration
            ? 'configuration_required'
            : 'unavailable',
          message: missingConfiguration
            ? 'Esta versión de Android todavía no tiene activados los avisos push. Necesita una nueva instalación con el servicio de notificaciones configurado. Puedes consultar los avisos dentro de la app.'
            : 'No se pudo conectar con el servicio de notificaciones. Comprueba la conexión y vuelve a intentarlo.',
        });
        throw new Error(pushStatus.message);
      }
    }
    const {
      data: { session: current },
    } = await supabase.auth.getSession();
    if (current?.user.id !== session.user.id)
      return { status: 'denied', permission };
    await registerDevice(token);
    if (token) localStorage.setItem('coupleapp.pushToken', token);
    else localStorage.removeItem('coupleapp.pushToken');
    registered = {
      userId: session.user.id,
      granted: permission.granted,
      at: Date.now(),
    };
    failedRegistration = null;
    setPushStatus({
      status: permission.granted ? 'registered' : 'denied',
      message: permission.granted
        ? 'Dispositivo registrado para recibir avisos.'
        : 'Los avisos push están desactivados en este dispositivo.',
    });
    return {
      status: permission.granted ? 'registered' : 'denied',
      token,
      permission,
    };
  })();
  try {
    return await registration;
  } catch (error) {
    if (error.message !== pushStatus.message) {
      setPushStatus({ status: 'unavailable', message: 'No se pudo registrar este dispositivo para recibir avisos. Comprueba tu conexión y vuelve a intentarlo desde Ajustes.' });
    }
    throw new Error(pushStatus.message);
  } finally {
    registration = null;
  }
}
export async function openNotification(id) {
  if (
    typeof id !== 'string' ||
    !/^[0-9a-f-]{36}$/i.test(id) ||
    !navigationRef.isReady()
  )
    return false;
  const { data, error } = await supabase
    .from('notifications')
    .select('id,couple_id,data')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return false;
  const { data: couple, error: coupleError } =
    await supabase.rpc('get_my_couple');
  if (coupleError) throw coupleError;
  if (!couple || couple.id !== data.couple_id) return false;
  const screen = routes.has(data.data?.screen) ? data.data.screen : 'Avisos';
  navigationRef.navigate(screen,screen==='Preguntas'?{questionId:data.data?.questionId??null}:undefined);
  const { error: readError } = await supabase.rpc('mark_notification_read', {
    p_id: id,
  });
  if (readError) throw readError;
  return true;
}
export async function drainNotificationResponse() {
  if (!pendingResponse || !navigationRef.isReady()) return;
  const response = pendingResponse;
  const id = response.notification.request.content.data?.notificationId;
  if (
    localStorage.getItem('coupleapp.lastNotification') ===
    response.notification.request.identifier
  ) {
    pendingResponse = null;
    return;
  }
  const opened = response.notification.request.content.data?.type === 'local_reminder'
    ? await openLocalReminder(response.notification.request.content.data)
    : await openNotification(id);
  if (opened) {
    localStorage.setItem(
      'coupleapp.lastNotification',
      response.notification.request.identifier,
    );
    if (pendingResponse === response) pendingResponse = null;
    await Notifications.clearLastNotificationResponseAsync();
  }
}
async function openLocalReminder(data) {
  if (!navigationRef.isReady() || !['Fechas', 'Planes'].includes(data.screen)) return false;
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user.id !== data.userId) return false;
  const { data: couple, error } = await supabase.rpc('get_my_couple');
  if (error) throw error;
  if (couple?.id !== data.coupleId || couple.members?.length !== 2) return false;
  const result = await supabase.from(data.screen === 'Planes' ? 'couple_plans' : 'special_dates')
    .select('id').eq('couple_id', couple.id).eq('id', data.entityId).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return false;
  navigationRef.navigate(data.screen);
  return true;
}
export function startNotificationResponses(onError) {
  const receive = (response) => {
    pendingResponse = response;
    void drainNotificationResponse().catch(onError);
  };
  const subscription =
    Notifications.addNotificationResponseReceivedListener(receive);
  const tokens = Platform.OS === 'ios' ? null : Notifications.addPushTokenListener(() => {
    void registerForPushNotifications({ force: true }).catch(onError);
  });
  let active = true;
  void Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (active && response) receive(response);
    })
    .catch(onError);
  return () => {
    active = false;
    subscription.remove();
    tokens?.remove();
  };
}

export function startLocalNotifications(userId, { onError = () => {} } = {}) {
  if (Platform.OS !== 'ios' || !userId) return () => {};
  let active = true;
  const load = async () => {
    await syncLocalNotifications({ userId,
      isCurrent: () => active && AppState.currentState === 'active',
      currentRoute: () => navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : null,
    });
    return null;
  };
  const stops = [
    ['notifications', `user_id=eq.${userId}`],
    ['user_settings', `user_id=eq.${userId}`],
    ['special_dates', undefined], ['couple_plans', undefined], ['couple_members', `user_id=eq.${userId}`],
  ].map(([table, filter]) => watchQuery({
    channelName: `local-notifications-${table}-${userId}`, table, filter,
    load, onData: () => {}, onError,
  }));
  // Foreground recovery. Background work is driven by native tasks, not timers.
  let polling = false;
  const timer = setInterval(async () => {
    if (!active || polling || AppState.currentState !== 'active') return;
    polling = true;
    try { await load(); } catch (error) { onError(error); }
    finally { polling = false; }
  }, 30000);
  return () => { active = false; clearInterval(timer); stops.forEach(stop => stop()); };
}

export async function testLocalNotification({ delaySeconds = 0 } = {}) {
  const permission = await getNotificationPermission();
  if (!permission.granted) throw new Error('Activa primero el permiso de notificaciones.');
  await Notifications.scheduleNotificationAsync({
    identifier: 'coupleapp-notification-test',
    content: { title: 'CoupleApp', body: 'Las notificaciones locales funcionan en este dispositivo.', sound: 'default' },
    trigger: delaySeconds > 0 ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: delaySeconds } : null,
  });
}
export function watchNotifications(userId, handlers) {
  return watchQuery({
    channelName: `notifications-${userId}`,
    table: 'notifications',
    filter: `user_id=eq.${userId}`,
    async load() {
      const { data, error } = await supabase
        .from('notifications')
        .select('id,title,body,kind,read_at,created_at')
        .eq('user_id', userId)
        .or('data->>type.is.null,data->>type.neq.tracking_control')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    ...handlers,
  });
}
