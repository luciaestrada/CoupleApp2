import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { supabase } from '../supabase/client';

export const GEOFENCE_TASK = 'GEOFENCE_TASK';

function parseRegionIdentifier(identifier) {
  const [geofenceId, coupleId, userId] = identifier.split('|');
  return { geofenceId, coupleId, userId };
}

if (!TaskManager.isTaskDefined(GEOFENCE_TASK)) {
  TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
    if (error || data?.eventType !== Location.GeofencingEventType.Enter) return;

    const { geofenceId, coupleId, userId } = parseRegionIdentifier(data.region.identifier);
    if (!geofenceId || !coupleId || !userId) return;

    const { error: insertError } = await supabase.from('geofence_events').insert({
      geofence_id: geofenceId,
      couple_id: coupleId,
      user_id: userId,
      event_type: 'enter',
    });
    if (insertError) console.error('No se pudo registrar la llegada:', insertError);
  });
}

export async function registerGeofences(geofences, coupleId, userId) {
  const regions = geofences.map((geofence) => ({
    identifier: `${geofence.id}|${coupleId}|${userId}`,
    latitude: geofence.lat,
    longitude: geofence.lng,
    radius: geofence.radiusMeters || geofence.radius_meters || 150,
    notifyOnEnter: true,
    notifyOnExit: false,
  }));

  const alreadyRegistered = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
  if (regions.length === 0) {
    if (alreadyRegistered) await Location.stopGeofencingAsync(GEOFENCE_TASK);
    return;
  }
  await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
}
