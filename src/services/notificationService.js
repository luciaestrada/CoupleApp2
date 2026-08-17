import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../supabase/client';
import {
  getNotificationPermission,
  requestNotificationPermission,
} from './permissionService';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotifications({ requestPermission = false } = {}) {
  async function ensureAndroidChannel() {
    if (Platform.OS !== 'android') return;
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Notificaciones de pareja',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#D6336C',
    });
  }

  let permission = await getNotificationPermission();
  if (!permission.granted && requestPermission && permission.canAskAgain) {
    // Android 13 no muestra el prompt hasta que existe al menos un canal.
    await ensureAndroidChannel();
    permission = await requestNotificationPermission();
  }
  if (!permission.granted) {
    // La revocación local no debe bloquear la UI si la limpieza remota falla sin conexión.
    await supabase.rpc('set_push_token', { p_token: null });
    return { status: 'denied', permission };
  }

  await ensureAndroidChannel();

  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) throw new Error('Falta expo.extra.eas.projectId en app.json.');

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const { error } = await supabase.rpc('set_push_token', { p_token: token });
  if (error) throw error;
  return { status: 'registered', token, permission };
}
