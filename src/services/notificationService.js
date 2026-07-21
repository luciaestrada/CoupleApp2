import * as Notifications from 'expo-notifications';
import { supabase } from '../supabase/client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotifications(userId) {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return null;

  try {
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    const { error } = await supabase
      .from('profiles')
      .update({ expo_push_token: token })
      .eq('id', userId);
    if (error) throw error;
    return token;
  } catch (error) {
    console.warn('No se pudo registrar el token de notificaciones:', error);
    return null;
  }
}
