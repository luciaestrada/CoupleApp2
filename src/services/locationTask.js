import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import * as TaskManager from 'expo-task-manager';
import { supabase } from '../supabase/client';
import { syncLocalNotifications } from './localNotificationSync';

export const GEOFENCE_TASK = 'GEOFENCE_TASK';
export const MAX_GEOFENCE_REGIONS = 20;

let registrationQueue = Promise.resolve();

const EVENT_QUEUE = 'coupleapp.geofence.events';
const PAUSED_KEY = 'coupleapp.geofence.paused';
const pauseListeners = new Set();
export function watchGeofencePause(listener) {
  pauseListeners.add(listener);
  return () => pauseListeners.delete(listener);
}
export function areGeofencesPaused() {
  return localStorage.getItem(PAUSED_KEY) === 'true';
}
export async function pauseGeofences() {
  // Persist before any await: delayed callbacks and registrations must observe it.
  localStorage.setItem(PAUSED_KEY, 'true');
  localStorage.removeItem(EVENT_QUEUE);
  pauseListeners.forEach(listener => listener(true));
  return registerGeofences([]);
}
export function resumeGeofences() {
  localStorage.removeItem(PAUSED_KEY);
  pauseListeners.forEach(listener => listener(false));
}
let flushing = false;
function readEvents() {
  try {
    return JSON.parse(localStorage.getItem(EVENT_QUEUE) ?? '[]');
  } catch {
    return [];
  }
}
export async function flushGeofenceEvents() {
  if (areGeofencesPaused()) { localStorage.removeItem(EVENT_QUEUE); return; }
  if (flushing) return;
  flushing = true;
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error || !session) return;
    if (session.expires_at * 1000 < Date.now() + 60_000) {
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) return;
    }
    for (const event of readEvents()) {
      if (areGeofencesPaused()) break;
      if (
        event.userId !== session.user.id ||
        Date.parse(event.recordedAt) < Date.now() - 30 * 60_000
      ) {
        localStorage.setItem(
          EVENT_QUEUE,
          JSON.stringify(readEvents().filter((item) => item.id !== event.id)),
        );
        continue;
      }
      const { error } = await supabase.rpc('record_geofence_transition', {
        p_geofence_id: event.geofenceId,
        p_event_id: event.id,
        p_recorded_at: event.recordedAt,
        p_transition: event.transition ?? 'enter',
      });
      if (error && !['42501', '22023', 'P0002'].includes(error.code)) break;
      localStorage.setItem(
        EVENT_QUEUE,
        JSON.stringify(readEvents().filter((item) => item.id !== event.id)),
      );
    }
  } finally {
    flushing = false;
  }
}

async function processGeofenceTask({ data, error }) {
    if (areGeofencesPaused()) return;
    if (error || !data?.region?.identifier) return;
    const geofenceId = data.region.identifier;
    const key = `coupleapp.geofence.state.${geofenceId}`;
    const previous = localStorage.getItem(key);
    const entering = data.eventType === Location.GeofencingEventType.Enter;
    localStorage.setItem(key, entering ? 'inside' : 'outside');
    // iOS reports the initial region state at registration. It isn't a new arrival.
    if (
      previous === (entering ? 'inside' : 'outside') ||
      !previous
    )
      return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session || areGeofencesPaused()) return;
    const events = readEvents().filter(
      (item) => item.userId === session.user.id,
    );
    events.push({
      id: Crypto.randomUUID(),
      geofenceId,
      userId: session.user.id,
      recordedAt: new Date().toISOString(),
      transition: entering ? 'enter' : 'exit',
    });
    localStorage.setItem(EVENT_QUEUE, JSON.stringify(events.slice(-40)));
    await flushGeofenceEvents();
}
if (!TaskManager.isTaskDefined(GEOFENCE_TASK)) {
  TaskManager.defineTask(GEOFENCE_TASK, async (event) => {
    try { await processGeofenceTask(event); }
    finally {
      if (!event.error && event.data?.region?.identifier)
        await syncLocalNotifications({ source: 'location' }).catch(() => {});
    }
  });
}

async function replaceRegisteredGeofences(geofences) {
  const permission = await Location.getBackgroundPermissionsAsync();
  if (areGeofencesPaused()) geofences = [];
  if (!permission.granted) {
    // Expo rejects even hasStartedGeofencingAsync without this permission.
    localStorage.removeItem('coupleapp.geofence.signature');
    localStorage.removeItem(EVENT_QUEUE);
    return false;
  }
  if (geofences.length > MAX_GEOFENCE_REGIONS) {
    throw new Error(
      `Solo se pueden monitorizar ${MAX_GEOFENCE_REGIONS} lugares.`,
    );
  }

  const signature = JSON.stringify(
    geofences.map((place) => [
      place.id,
      place.lat,
      place.lng,
      place.radiusMeters,
    ]),
  );
  let alreadyRegistered;
  try {
    alreadyRegistered = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
  } catch (error) {
    if (!(await Location.getBackgroundPermissionsAsync()).granted) return false;
    throw error;
  }
  if (areGeofencesPaused()) geofences = [];
  if (geofences.length === 0) {
    if (alreadyRegistered) await Location.stopGeofencingAsync(GEOFENCE_TASK);
    localStorage.removeItem('coupleapp.geofence.signature');
    localStorage.removeItem(EVENT_QUEUE);
    return true;
  }

  if (
    alreadyRegistered &&
    localStorage.getItem('coupleapp.geofence.signature') === signature
  )
    return true;
  await Location.startGeofencingAsync(
    GEOFENCE_TASK,
    geofences.map((geofence) => ({
      identifier: geofence.id,
      latitude: geofence.lat,
      longitude: geofence.lng,
      radius: geofence.radiusMeters,
      notifyOnEnter: true,
      notifyOnExit: true,
    })),
  );
  if (areGeofencesPaused()) {
    await Location.stopGeofencingAsync(GEOFENCE_TASK);
    return false;
  }
  localStorage.setItem('coupleapp.geofence.signature', signature);
  return true;
}

export function registerGeofences(geofences) {
  const nextRegistration = registrationQueue
    .catch(() => undefined)
    .then(() => replaceRegisteredGeofences(geofences));
  registrationQueue = nextRegistration;
  return nextRegistration;
}
