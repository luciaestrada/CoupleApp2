import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';
import * as Crypto from 'expo-crypto';
import { AppState, Platform } from 'react-native';
import { supabase } from '../../supabase/client';
import { getDeviceId } from '../../services/deviceService';
import { effectiveMode, shouldPublish } from './policy';

export const TRACKING_TASK = 'COUPLEAPP_LOCATION_V2';
const CONFIG_KEY = 'coupleapp.tracking';
const QUEUE_KEY = 'coupleapp.location.pending';
let generation = 0;
let watcher;
let retryTimer;
let expiryTimer;
let busy = false;
let lastSample;
let failures = 0;
let nativeQueue = Promise.resolve();
let listener = () => {};

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

function emit(status, error = null) {
  listener({ status, error });
}
export function onTrackingStatus(callback) {
  listener = callback;
  return () => {
    listener = () => {};
  };
}

function nativeOperation(operation) {
  nativeQueue = nativeQueue.catch(() => undefined).then(operation);
  return nativeQueue;
}

async function stopNative() {
  if (await Location.hasStartedLocationUpdatesAsync(TRACKING_TASK))
    await Location.stopLocationUpdatesAsync(TRACKING_TASK);
}

export async function stopTracking({ clear = true } = {}) {
  generation += 1;
  watcher?.remove();
  watcher = null;
  clearTimeout(retryTimer);
  clearTimeout(expiryTimer);
  lastSample = null;
  if (clear) {
    const config = read(CONFIG_KEY);
    if (config?.userId)
      localStorage.setItem(`coupleapp.trackingPaused.${config.userId}`, 'true');
    localStorage.removeItem(CONFIG_KEY);
    localStorage.removeItem(QUEUE_KEY);
  }
  emit('paused');
  await nativeOperation(stopNative);
}

export async function flushLocation() {
  if (busy) return;
  const config = read(CONFIG_KEY);
  const pending = read(QUEUE_KEY);
  if (
    !pending ||
    !config ||
    pending.userId !== config.userId ||
    effectiveMode(config) === 'off'
  )
    return;
  busy = true;
  let published = false;
  const current = generation;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (current !== generation || session?.user.id !== config.userId) return;
    const { error } = await supabase.rpc('publish_location_sample', {
      p_sample: pending.sample,
    });
    if (current !== generation) return;
    if (error) {
      if (error.code === '42501') {
        await stopTracking();
        emit(
          'unavailable',
          'La compartición se ha desactivado o está activa en otro dispositivo.',
        );
        return;
      }
      if (error.code === '22023') {
        localStorage.removeItem(QUEUE_KEY);
        return;
      }
      throw error;
    }
    failures = 0;
    published = true;
    if (read(QUEUE_KEY)?.sample.sample_id === pending.sample.sample_id)
      localStorage.removeItem(QUEUE_KEY);
    emit('sharing');
  } catch {
    if (current !== generation) return;
    emit(
      'offline',
      'Pendiente de conexión. Se enviará la ubicación más reciente.',
    );
    clearTimeout(retryTimer);
    if (AppState.currentState === 'active')
      retryTimer = setTimeout(
        () => void flushLocation(),
        Math.min(300_000, 5_000 * 2 ** Math.min(failures++, 6)) +
          Math.random() * 1000,
      );
  } finally {
    busy = false;
    if (published && current === generation && read(QUEUE_KEY))
      void flushLocation();
  }
}

async function acceptLocation(location, expectedGeneration = generation) {
  if (expectedGeneration !== generation) return;
  const config = read(CONFIG_KEY);
  const mode = effectiveMode(config);
  if (mode === 'off') {
    await stopTracking();
    return;
  }
  const sample = {
    user_id: config.userId,
    sample_id: Crypto.randomUUID(),
    device_id: getDeviceId(),
    captured_at: new Date(location.timestamp).toISOString(),
    lat: location.coords.latitude,
    lng: location.coords.longitude,
    accuracy_m: location.coords.accuracy,
    approximate: !!config.approximate,
    speed_mps: location.coords.speed,
    heading: location.coords.heading,
  };
  if (shouldPublish(lastSample, sample, mode)) {
    lastSample = sample;
    localStorage.setItem(
      QUEUE_KEY,
      JSON.stringify({ userId: config.userId, sample }),
    );
  }
  await flushLocation();
}

if (!TaskManager.isTaskDefined(TRACKING_TASK)) {
  TaskManager.defineTask(TRACKING_TASK, async ({ data, error }) => {
    if (error) {
      emit('unavailable', error.message);
      return;
    }
    const locations = data?.locations ?? [];
    const newest = locations.reduce(
      (latest, value) =>
        !latest || value.timestamp > latest.timestamp ? value : latest,
      null,
    );
    if (newest) await acceptLocation(newest);
  });
}

export function allowTracking(userId) {
  localStorage.removeItem(`coupleapp.trackingPaused.${userId}`);
}

export async function configureTracking(config) {
  const stopping = stopTracking({ clear: false });
  const current = generation;
  await stopping;
  if (current !== generation) return;
  if (
    !config ||
    localStorage.getItem(`coupleapp.trackingPaused.${config.userId}`) ||
    config.tracking_device_id !== getDeviceId() ||
    effectiveMode(config) === 'off'
  ) {
    localStorage.removeItem(CONFIG_KEY);
    localStorage.removeItem(QUEUE_KEY);
    return;
  }
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  const [permission, services, background, power] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.hasServicesEnabledAsync(),
    Location.getBackgroundPermissionsAsync(),
    Battery.getPowerStateAsync().catch(() => ({
      lowPowerMode: false,
      batteryLevel: 1,
    })),
  ]);
  if (current !== generation) return;
  if (!permission.granted || !services) {
    emit('unavailable', 'Activa la ubicación y sus permisos en Cuenta.');
    return;
  }
  const mode = effectiveMode(
    config,
    Date.now(),
    power.lowPowerMode || (power.batteryLevel >= 0 && power.batteryLevel < 0.2),
  );
  config = {
    ...config,
    approximate:
      permission.ios?.accuracy === 'reduced' ||
      permission.android?.accuracy === 'coarse',
  };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  const live = mode === 'live' && !config.approximate;
  if (config.location_mode === 'live')
    expiryTimer = setTimeout(
      () => void stopTracking().catch(() => {}),
      Math.max(0, Date.parse(config.live_until) - Date.now()),
    );
  const options = {
    accuracy: live ? Location.Accuracy.High : Location.Accuracy.Balanced,
    distanceInterval: live ? 5 : 50,
    timeInterval: live ? 5_000 : 60_000,
  };
  if (config.background_enabled && background.granted) {
    await nativeOperation(async () => {
      if (current !== generation) return;
      await Location.startLocationUpdatesAsync(TRACKING_TASK, {
        ...options,
        pausesUpdatesAutomatically: true,
        activityType: Location.LocationActivityType.Other,
        deferredUpdatesInterval: live ? 0 : 180_000,
        deferredUpdatesDistance: live ? 0 : 100,
        showsBackgroundLocationIndicator: true,
        ...(Platform.OS === 'android'
          ? {
              foregroundService: {
                notificationTitle: 'Ubicación compartida',
                notificationBody: live
                  ? 'Sesión en vivo · Puedes detenerla en Mapa'
                  : 'Modo de bajo consumo · Puedes detenerlo en Mapa',
                killServiceOnDestroy: true,
              },
            }
          : {}),
      });
    });
  } else if (AppState.currentState === 'active') {
    const subscription = await Location.watchPositionAsync(
      options,
      (location) => {
        void acceptLocation(location, current).catch(() =>
          emit('unavailable', 'No se pudo compartir la ubicación.'),
        );
      },
    );
    if (current !== generation) subscription.remove();
    else watcher = subscription;
  }
  if (current !== generation) return;
  emit(
    'waiting',
    config.background_enabled && !background.granted
      ? 'Falta permiso permanente; se comparte solo al usar la app.'
      : null,
  );
  const cached = await Location.getLastKnownPositionAsync({
    maxAge: 60000,
    requiredAccuracy: config.approximate ? 10000 : 100,
  }).catch(() => null);
  if (cached && current === generation) await acceptLocation(cached, current);
  await flushLocation();
}

export function suspendForegroundTracking() {
  watcher?.remove();
  watcher = null;
  clearTimeout(retryTimer);
}
