import { requireOptionalNativeModule } from 'expo-modules-core';
const native = requireOptionalNativeModule('CoupleMotion');
export async function requestActivityPermission() {
  if (!native) throw new Error('Instala la versión actualizada para activar el reconocimiento de actividad.');
  return native.requestPermissionsAsync();
}
export async function startActivityTracking() { return native?.startAsync(); }
export async function stopActivityTracking() { return native?.stopAsync(); }
export async function readActivity() { return native?.getActivityAsync() ?? null; }
