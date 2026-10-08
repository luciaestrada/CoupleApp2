import * as Location from 'expo-location';
import { AppState } from 'react-native';
import { supabase } from '../supabase/client';
import { watchQuery } from './realtimeService';
import { watchSettings } from './settingsService';
import { MAX_GEOFENCE_REGIONS, registerGeofences, watchGeofencePause } from './locationTask';
import type { Geofence, Handlers, Row } from '../types/domain';
import { asError, type AppError } from '../utils/errors';

export { MAX_GEOFENCE_REGIONS };

function normalizeGeofence(geofence: Pick<Row<'geofences'>, 'id' | 'name' | 'lat' | 'lng' | 'radius_meters'>): Geofence {
  return {
    id: geofence.id,
    name: geofence.name,
    lat: geofence.lat,
    lng: geofence.lng,
    radiusMeters: geofence.radius_meters,
  };
}

export function watchGeofences(coupleId: string, userId: string, handlers: Handlers<Geofence[]>) {
  return watchQuery({
    channelName: `geofences-${coupleId}-${userId}`,
    table: 'geofences',
    filter: `user_id=eq.${userId}`,
    async load() {
      const { data, error } = await supabase
        .from('geofences')
        .select('id,name,lat,lng,radius_meters')
        .eq('couple_id', coupleId)
        .eq('user_id', userId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data.map(normalizeGeofence);
    },
    ...handlers,
  });
}

export async function createGeofence({ name, lat, lng, radiusMeters }: Omit<Geofence, 'id'>) {
  const { data, error } = await supabase.rpc('create_geofence', {
    p_name: name.trim(),
    p_lat: lat,
    p_lng: lng,
    p_radius_meters: radiusMeters,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      typeof data.id !== 'string' || typeof data.name !== 'string' ||
      typeof data.lat !== 'number' || typeof data.lng !== 'number' || typeof data.radius_meters !== 'number')
    throw new Error('El servidor no devolvió un lugar válido.');
  return normalizeGeofence({ id: data.id, name: data.name, lat: data.lat, lng: data.lng, radius_meters: data.radius_meters });
}

export async function deleteGeofence(geofenceId: string) {
  const { error } = await supabase.rpc('delete_geofence', {
    p_geofence_id: geofenceId,
  });
  if (error) throw error;
}

export async function syncGeofences(geofences: Geofence[]) {
  const permission = await Location.getBackgroundPermissionsAsync();
  if (permission.status !== 'granted') {
    await registerGeofences([]);
    return false;
  }
  return registerGeofences(geofences);
}

export function startGeofenceSync(coupleId: string, userId: string, { onError }: { onError(error: AppError): void }) {
  let latest: Geofence[] = [];
  let active = true;
  let permitted = false;
  const sync = () => {
    if (active) void syncGeofences(permitted ? latest : []).catch(error => onError(asError(error)));
  };
  const stopSettings = watchSettings(userId, {
    onData: settings => { permitted = settings.geofence_paused !== true && (settings.shared_precision !== 'approximate' || settings.approximate_place_events === true); sync(); },
    onError: error => { permitted = false; sync(); onError(error); },
  });
  const stop = watchGeofences(coupleId, userId, {
    onData: (geofences) => {
      latest = geofences;
      sync();
    },
    onError,
  });
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') sync();
  });
  const stopPause = watchGeofencePause(sync);
  return () => {
    active = false;
    stop();
    subscription.remove();
    stopPause();
    stopSettings();
  };
}
