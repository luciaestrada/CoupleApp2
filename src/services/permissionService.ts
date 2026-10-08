import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';
import {
  normalizeNotificationPermission,
  normalizePermission,
  permissionNeedsSettings,
} from '../utils/permissionUtils';

export { permissionNeedsSettings };

export async function getNotificationPermission() {
  return normalizeNotificationPermission(await Notifications.getPermissionsAsync());
}

export async function requestNotificationPermission() {
  return normalizeNotificationPermission(await Notifications.requestPermissionsAsync());
}

export async function getForegroundLocationPermission() {
  return normalizePermission(await Location.getForegroundPermissionsAsync());
}

export async function requestForegroundLocationPermission() {
  return normalizePermission(await Location.requestForegroundPermissionsAsync());
}

export async function getBackgroundLocationPermission() {
  return normalizePermission(await Location.getBackgroundPermissionsAsync());
}

export async function getLocationServicesPermission() {
  const granted = await Location.hasServicesEnabledAsync();
  return { status: granted ? 'granted' : 'denied', granted, canAskAgain: true, expires: 'never' };
}

export async function requestLocationServicesPermission() {
  if (Platform.OS === 'android') {
    try {
      await Location.enableNetworkProviderAsync();
    } catch {
      // El usuario puede cerrar el diálogo del sistema sin activar la ubicación.
    }
  }
  return getLocationServicesPermission();
}

export async function requestBackgroundLocationPermission() {
  let foreground = await getForegroundLocationPermission();
  if (!foreground.granted && foreground.canAskAgain) {
    foreground = await requestForegroundLocationPermission();
  }
  if (!foreground.granted) {
    return { foreground, background: await getBackgroundLocationPermission() };
  }

  let background = await getBackgroundLocationPermission();
  if (!background.granted && background.canAskAgain) {
    background = normalizePermission(await Location.requestBackgroundPermissionsAsync());
  }
  return { foreground, background };
}

export async function getPermissionSnapshot() {
  const [notifications, locationServices, locationForeground, locationBackground] = await Promise.all([
    getNotificationPermission(),
    getLocationServicesPermission(),
    getForegroundLocationPermission(),
    getBackgroundLocationPermission(),
  ]);
  return { notifications, locationServices, locationForeground, locationBackground };
}

export function openAppSettings() {
  return Linking.openSettings();
}

export function openLocationSettings() {
  if (Platform.OS === 'android') {
    return Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS');
  }
  return Linking.openSettings();
}
