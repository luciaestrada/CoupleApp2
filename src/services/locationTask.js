import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { supabase } from '../supabase/client';

export const GEOFENCE_TASK = 'GEOFENCE_TASK';
export const MAX_GEOFENCE_REGIONS = 20;

let registrationQueue = Promise.resolve();

if (!TaskManager.isTaskDefined(GEOFENCE_TASK)) {
  TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
    if (error) throw error;
    if (data?.eventType !== Location.GeofencingEventType.Enter) return;

    const geofenceId = data.region.identifier;
    if (!geofenceId) throw new Error('El evento de geofencing no contiene un identificador.');

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!sessionData.session) return;

    const expiresSoon = sessionData.session.expires_at * 1000 <= Date.now() + 60_000;
    if (expiresSoon) {
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw refreshError;
    }

    const { error: insertError } = await supabase.rpc('record_geofence_entry', {
      p_geofence_id: geofenceId,
    });
    if (insertError) throw insertError;
  });
}

async function replaceRegisteredGeofences(geofences) {
  if (geofences.length > MAX_GEOFENCE_REGIONS) {
    throw new Error(`Solo se pueden monitorizar ${MAX_GEOFENCE_REGIONS} lugares.`);
  }

  const alreadyRegistered = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
  if (geofences.length === 0) {
    if (alreadyRegistered) await Location.stopGeofencingAsync(GEOFENCE_TASK);
    return;
  }

  await Location.startGeofencingAsync(
    GEOFENCE_TASK,
    geofences.map((geofence) => ({
      identifier: geofence.id,
      latitude: geofence.lat,
      longitude: geofence.lng,
      radius: geofence.radiusMeters,
      notifyOnEnter: true,
      notifyOnExit: false,
    }))
  );
}

export function registerGeofences(geofences) {
  const nextRegistration = registrationQueue
    .catch(() => undefined)
    .then(() => replaceRegisteredGeofences(geofences));
  registrationQueue = nextRegistration;
  return nextRegistration;
}
