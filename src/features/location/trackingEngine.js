import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';
import * as Crypto from 'expo-crypto';
import { DeviceMotion } from 'expo-sensors';
import { createLiveSampler } from './liveSampler';
import { startActivityTracking, stopActivityTracking, readActivity } from './activityService';
import { AppState, Platform } from 'react-native';
import { supabase } from '../../supabase/client';
import { getDeviceId } from '../../services/deviceService';
import { effectiveMode, shouldPublish } from './policy';
import { syncLocalNotifications } from '../../services/localNotificationSync';

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
let syncPromise;
let lastConfigSync = 0;
let sampledForeground = false;
let motionSubscription;
let lastPowerRead = 0;
let cachedPower = {};

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

function emit(status, error = null) {
  const config = read(CONFIG_KEY);
  listener({ status, error, autoLiveUntil: config?.auto_live_until ?? null });
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
  return resetTracking({ clear });
}

async function resetTracking({ clear = true, preserveNative = false } = {}) {
  generation += 1;
  watcher?.remove();
  watcher = null;
  motionSubscription?.remove();
  motionSubscription = null;
  sampledForeground = false;
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
  await nativeOperation(async () => {
    try { if (!preserveNative) await stopNative(); }
    finally { await stopActivityTracking().catch(() => {}); }
  });
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
  if (Date.now() - lastConfigSync > 30_000)
    await syncTrackingConfig().catch(() => {});
  if (expectedGeneration !== generation) return;
  const config = read(CONFIG_KEY);
  const mode = effectiveMode(config);
  if (mode === 'off') {
    await stopTracking({clear: !config || config.location_mode === 'off' || config.location_mode === 'live'});
    return;
  }
  if (Date.now() - lastPowerRead > 30000) {
    cachedPower = await Battery.getPowerStateAsync().catch(() => ({}));
    lastPowerRead = Date.now();
    if (expectedGeneration !== generation) return;
    const powerSave = cachedPower.lowPowerMode ||
      (cachedPower.batteryLevel >= 0 && cachedPower.batteryLevel < ((config.location_options?.battery_threshold ?? 20) / 100));
    if (typeof cachedPower.lowPowerMode === 'boolean' && !!config.powerSave !== !!powerSave) {
      await configureTracking({ ...config, powerSave });
      return;
    }
  }
  if (expectedGeneration !== generation) return;
  const activity = config.location_options?.share_activity === false ? null : await readActivity().catch(() => null);
  if (expectedGeneration !== generation) return;
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
    activity: activity?.activity ?? 'unknown',
    activity_confidence: activity?.confidence ?? 'low',
    battery_level: Number.isFinite(cachedPower.batteryLevel) && cachedPower.batteryLevel >= 0
      ? Math.round(cachedPower.batteryLevel * 100) : null,
    charging: cachedPower.batteryState == null ? null :
      cachedPower.batteryState === Battery.BatteryState?.CHARGING || cachedPower.batteryState === Battery.BatteryState?.FULL,
  };
  if (shouldPublish(lastSample, sample, mode, Date.now(), { ...config.location_options, trip_active: config.trip_active })) {
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
    if (newest) {
      const [locationResult] = await Promise.allSettled([
        acceptLocation(newest), syncLocalNotifications({ source: 'location' }),
      ]);
      if (locationResult.status === 'rejected') throw locationResult.reason;
    }
  });
}

export function allowTracking(userId) {
  localStorage.removeItem(`coupleapp.trackingPaused.${userId}`);
}

export async function syncTrackingConfig() {
  if (syncPromise) return syncPromise;
  const current = generation;
  lastConfigSync = Date.now();
  syncPromise = (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || current !== generation ||
      localStorage.getItem(`coupleapp.trackingPaused.${session.user.id}`)) return;
    const { data, error } = await supabase.rpc('get_tracking_config', { p_device_id: getDeviceId() });
    if (error) throw error;
    if (current !== generation || (data && data.userId !== session.user.id)) return;
    const previous = read(CONFIG_KEY);
    // A settings snapshot remains the authority for baseline sharing. Push
    // cannot opt a device into tracking when its local configuration is absent.
    if (!previous || previous.userId !== session.user.id) return;
    if (!data) { await stopTracking({ clear: false }); localStorage.removeItem(CONFIG_KEY); return; }
    const same = ['location_mode','live_until','tracking_device_id','background_enabled','auto_live_enabled','trip_active']
      .every(key => previous[key] === data[key]) && JSON.stringify(previous.location_options) === JSON.stringify(data.location_options);
    const next = { ...data, powerSave: previous.powerSave, approximate: previous.approximate };
    if (same && previous.acquisitionMode === effectiveMode(next)) {
      next.acquisitionMode = previous.acquisitionMode;
      localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
      armExpiry(next);
      emit(effectiveMode(next) === 'off' ? 'paused' : 'waiting');
    } else await configureTracking(data);
  })().finally(() => { syncPromise = null; });
  return syncPromise;
}

function armExpiry(config) {
  clearTimeout(expiryTimer);
  if (config.location_mode === 'live') {
    expiryTimer = setTimeout(() => void stopTracking().catch(() => {}),
      Math.max(0, Date.parse(config.live_until) - Date.now()));
  } else if (Date.parse(config.auto_live_until) > Date.now()) {
    expiryTimer = setTimeout(() => {
      const latest = read(CONFIG_KEY);
      if (latest?.userId !== config.userId) return;
      void configureTracking({ ...latest, auto_live_until: null }).catch(() => {});
    }, Math.max(0, Date.parse(config.auto_live_until) - Date.now()));
  }
}

export async function configureTracking(config) {
  const previous = read(CONFIG_KEY);
  // Updating an existing Expo task keeps its foreground service alive. Stopping
  // it first would require a new foreground launch, forbidden in background.
  const preserveNative = Platform.OS === 'android' && config?.background_enabled &&
    previous?.userId === config.userId &&
    config.tracking_device_id === getDeviceId() &&
    !localStorage.getItem(`coupleapp.trackingPaused.${config.userId}`) &&
    effectiveMode({ ...config, powerSave: false }) !== 'off';
  const stopping = resetTracking({ clear: false, preserveNative });
  const current = generation;
  await stopping;
  if (current !== generation) return;
  if (
    !config ||
    localStorage.getItem(`coupleapp.trackingPaused.${config.userId}`) ||
    config.tracking_device_id !== getDeviceId() ||
    effectiveMode(config ? { ...config, powerSave: false } : null) === 'off'
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
    await nativeOperation(stopNative);
    emit('unavailable', 'Activa la ubicación y sus permisos en Cuenta.');
    return;
  }
  cachedPower = power;
  lastPowerRead = Date.now();
  const powerSave =
    power.lowPowerMode || (power.batteryLevel >= 0 && power.batteryLevel < ((config.location_options?.battery_threshold ?? 20) / 100));
  const mode = effectiveMode({ ...config, powerSave });
  config = {
    ...config,
    powerSave,
    acquisitionMode: mode,
    approximate:
      config.shared_precision === 'approximate' ||
      permission.ios?.accuracy === 'reduced' ||
      permission.android?.accuracy === 'coarse',
  };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  if (mode === 'off') {
    await nativeOperation(stopNative);
    emit('paused', 'Ubicación temporalmente detenida por tu ajuste de batería.');
    return;
  }
  const live = mode === 'live' && !config.approximate;
  const useBackground = config.background_enabled && background.granted;
  if (!useBackground && preserveNative) await nativeOperation(stopNative);
  await nativeOperation(async () => {
    if (current !== generation) return;
    if (config.location_options?.share_activity !== false) await startActivityTracking().catch(() => {});
    else await stopActivityTracking().catch(() => {});
  });
  if (current !== generation) return;
  armExpiry(config);
  const options = {
    accuracy: live ? Location.Accuracy.High : Location.Accuracy.Balanced,
    // Android's distance gate also blocks stationary heartbeat fixes. Publication
    // still filters noise and throttles unchanged positions in shouldPublish.
    distanceInterval: (Platform.OS === 'android' && useBackground) || live || config.trip_active ? 0 : powerSave ? 200 : (config.location_options?.normal_distance ?? (useBackground ? 100 : 50)),
    timeInterval: live
      ? (config.location_options?.live_interval ?? 5) * 1000
      : powerSave
        ? 300_000
        : useBackground
          ? (config.location_options?.normal_interval ?? 180) * 1000
          : (config.location_options?.normal_interval ?? 60) * 1000,
  };
  if (live && AppState.currentState === 'active' && !(Platform.OS === 'android' && useBackground)) {
    sampledForeground = true;
    const sampler = createLiveSampler({
      interval: (config.location_options?.live_interval ?? 20) * 1000,
      watch: callback => Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 }, callback),
      onFix: location => void acceptLocation(location, current).catch(() => emit('unavailable', 'No se pudo compartir la ubicación.')),
      onError: () => emit('unavailable', 'No se pudo obtener una posición reciente. Se reintentará.'),
    });
    watcher = sampler;
    void Promise.all([DeviceMotion.isAvailableAsync(), DeviceMotion.getPermissionsAsync()])
      .then(([available, permission]) => {
        if (current !== generation || !available || !permission.granted || config.location_options?.motion_assist === false) return;
        DeviceMotion.setUpdateInterval(250);
        motionSubscription = DeviceMotion.addListener(event => sampler.motion(event));
      }).catch(() => {});
  } else if (useBackground) {
    await nativeOperation(async () => {
      if (current !== generation) return;
      await Location.startLocationUpdatesAsync(TRACKING_TASK, {
        ...options,
        pausesUpdatesAutomatically: !live,
        activityType: Location.LocationActivityType.Other,
        deferredUpdatesInterval: live || Platform.OS === 'android' ? 0 : options.timeInterval,
        deferredUpdatesDistance: live ? 0 : options.distanceInterval,
        showsBackgroundLocationIndicator: true,
        ...(Platform.OS === 'android'
          ? {
              foregroundService: {
                notificationTitle: 'Ubicación compartida',
                notificationBody: live
                  ? 'Sesión en vivo · Puedes detenerla en Mapa'
                  : 'Modo de bajo consumo · Puedes detenerlo en Mapa',
                killServiceOnDestroy: false,
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
  motionSubscription?.remove();
  motionSubscription = null;
  if (sampledForeground) {
    sampledForeground = false;
    const config = read(CONFIG_KEY);
    if (config) void configureTracking(config).catch(() => {});
  }
  clearTimeout(retryTimer);
}
