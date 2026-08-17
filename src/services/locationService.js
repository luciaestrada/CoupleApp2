import * as Location from 'expo-location';
import { supabase } from '../supabase/client';
import { watchQuery } from './realtimeService';
import {
  getForegroundLocationPermission,
  getLocationServicesPermission,
} from './permissionService';

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

async function publishLocation() {
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  const { error } = await supabase.rpc('publish_location', {
    p_lat: location.coords.latitude,
    p_lng: location.coords.longitude,
  });
  if (error) throw error;
}

export function startLocationHeartbeat({
  onError,
  onPermissionAvailable,
  onPermissionUnavailable,
  onServicesAvailable,
  onServicesUnavailable,
}) {
  let cancelled = false;
  let intervalId;

  async function start() {
    const services = await getLocationServicesPermission();
    if (cancelled) return;
    if (!services.granted) {
      onServicesUnavailable(services);
      return;
    }
    onServicesAvailable(services);
    const permission = await getForegroundLocationPermission();
    if (cancelled) return;
    if (!permission.granted) {
      onPermissionUnavailable(permission);
      return;
    }
    onPermissionAvailable(permission);
    await publishLocation();
    if (!cancelled) {
      intervalId = setInterval(
        () => publishLocation().catch(onError),
        HEARTBEAT_INTERVAL_MS
      );
    }
  }

  start().catch(onError);
  return () => {
    cancelled = true;
    if (intervalId) clearInterval(intervalId);
  };
}

export function watchUserLocation(coupleId, userId, handlers) {
  return watchQuery({
    channelName: `location-${coupleId}-${userId}`,
    table: 'locations',
    filter: `user_id=eq.${userId}`,
    async load() {
      const { data, error } = await supabase
        .from('locations')
        .select('lat,lng,updated_at')
        .eq('couple_id', coupleId)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      if (data === null) return null;
      return { lat: data.lat, lng: data.lng, updatedAt: data.updated_at };
    },
    ...handlers,
  });
}
