import { Platform } from 'react-native';
import Constants, { AppOwnership } from 'expo-constants';
import { clearStoredWidgetSnapshot, storeWidgetSnapshot } from './widgetStorage';
import type { CoupleWidgetSnapshot } from './types';

function hasNativeWidgetSupport() {
  return Constants.appOwnership !== AppOwnership.Expo;
}

export async function publishWidgetSnapshot(snapshot: CoupleWidgetSnapshot) {
  await storeWidgetSnapshot(snapshot);
  if (!hasNativeWidgetSupport()) return;
  if (Platform.OS === 'ios') {
    const { publishIosWidgets } = await import('./ios/publishWidgets');
    publishIosWidgets(snapshot);
  } else if (Platform.OS === 'android') {
    const { publishAndroidWidgets } = await import('./android/publishWidgets');
    await publishAndroidWidgets(snapshot);
  }
}

export async function clearWidgetSnapshot() {
  await clearStoredWidgetSnapshot();
  if (!hasNativeWidgetSupport()) return;
  if (Platform.OS === 'ios') {
    const { clearIosWidgets } = await import('./ios/publishWidgets');
    clearIosWidgets();
  } else if (Platform.OS === 'android') {
    const { publishAndroidWidgets } = await import('./android/publishWidgets');
    await publishAndroidWidgets(null);
  }
}
