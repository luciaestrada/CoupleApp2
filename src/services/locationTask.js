import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import { supabase } from '../supabase/client';

export const GEOFENCE_TASK = 'GEOFENCE_TASK';
export const MAX_GEOFENCE_REGIONS = 20;

let registrationQueue = Promise.resolve();

const EVENT_QUEUE = 'coupleapp.geofence.events';
let flushing = false;
function readEvents() {
  try {
    return JSON.parse(localStorage.getItem(EVENT_QUEUE) ?? '[]');
  } catch {
    return [];
  }
}
export async function flushGeofenceEvents() {
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
      const { error } = await supabase.rpc('record_geofence_entry_v2', {
        p_geofence_id: event.geofenceId,
        p_event_id: event.id,
        p_recorded_at: event.recordedAt,
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

if (!TaskManager.isTaskDefined(GEOFENCE_TASK)) {
  TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
    if (error || !data?.region?.identifier) return;
    const geofenceId = data.region.identifier;
    const key = `coupleapp.geofence.state.${geofenceId}`;
    const previous = localStorage.getItem(key);
    const entering = data.eventType === Location.GeofencingEventType.Enter;
    localStorage.setItem(key, entering ? 'inside' : 'outside');
    // iOS reports the initial region state at registration. It isn't a new arrival.
    if (
      !entering ||
      previous === 'inside' ||
      (Platform.OS === 'ios' && !previous)
    )
      return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    const events = readEvents().filter(
      (item) => item.userId === session.user.id,
    );
    events.push({
      id: Crypto.randomUUID(),
      geofenceId,
      userId: session.user.id,
      recordedAt: new Date().toISOString(),
    });
    localStorage.setItem(EVENT_QUEUE, JSON.stringify(events.slice(-40)));
    await flushGeofenceEvents();
  });
}

async function replaceRegisteredGeofences(geofences) {
  const permission = await Location.getBackgroundPermissionsAsync();
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
