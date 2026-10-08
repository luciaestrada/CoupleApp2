import { getDeviceId } from './deviceService';
import { supabase } from '../supabase/client';
import { watchQuery } from './realtimeService';
import type { Row, SharedLocation, Handlers } from '../types/domain';
import type { MapViewState } from '../features/location/mapViewing';

function normalizeLocation(row: Partial<Row<'locations'>> | null): SharedLocation | null {
  if (!row || !row.sharing) return null;
  if (typeof row.lat !== 'number' || typeof row.lng !== 'number' ||
      typeof row.captured_at !== 'string' || typeof row.updated_at !== 'string') return null;
  return {
    lat: row.lat,
    lng: row.lng,
    updatedAt: row.captured_at,
    receivedAt: row.updated_at,
    accuracy: row.accuracy_m ?? null,
    speed: row.speed_mps ?? null,
    heading: row.heading ?? null,
    batteryLevel: row.battery_level ?? null,
    charging: row.charging ?? null,
    activity: row.activity ?? null,
    activityConfidence: row.activity_confidence ?? null,
  };
}
export function watchUserLocation(coupleId: string, userId: string, handlers: Handlers<SharedLocation | null>) {
  return watchQuery({
    channelName: `location-${coupleId}-${userId}`,
    table: 'locations',
    filter: `user_id=eq.${userId}`,
    async load() {
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .eq('couple_id', coupleId)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return normalizeLocation(data);
    },
    reduce: (previous, payload) => normalizeLocation(payload.new),
    ...handlers,
  });
}
export async function getLocationHistory(
  coupleId: string,
  userId: string,
  before = new Date().toISOString(),
) {
  const { data, error } = await supabase
    .from('location_history')
    .select('*')
    .eq('couple_id', coupleId)
    .eq('user_id', userId)
    .lt('recorded_at', before)
    .gte('recorded_at', new Date(Date.now() - 24 * 3600_000).toISOString())
    .order('recorded_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data;
}
export async function clearLocationHistory() {
  const { error } = await supabase.rpc('clear_location_history');
  if (error) throw error;
}

export function watchLiveRequests(coupleId: string, handlers: Handlers<Row<'live_location_requests'>[]>) {
  return watchQuery({
    channelName: `live-requests-${coupleId}`,
    table: 'live_location_requests',
    filter: `couple_id=eq.${coupleId}`,
    async load() {
      const { data, error } = await supabase
        .from('live_location_requests')
        .select('*')
        .eq('couple_id', coupleId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    ...handlers,
  });
}
export async function requestLiveLocation() {
  const { error } = await supabase.rpc('request_live_location');
  if (error) throw error;
}
export async function renewMapView(sessionId: string): Promise<MapViewState> {
  const { data, error } = await supabase.rpc('renew_map_view', {
    p_device_id: getDeviceId(), p_session_id: sessionId,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.status !== 'string')
    throw new Error('El servidor devolvió una sesión de mapa inválida.');
  return { status: data.status, ...(typeof data.expiresAt === 'string' ? { expiresAt: data.expiresAt } : {}),
    ...(typeof data.until === 'string' ? { until: data.until } : {}) };
}
export async function endMapView(sessionId: string) {
  const { error } = await supabase.rpc('end_map_view', {
    p_device_id: getDeviceId(), p_session_id: sessionId,
  });
  if (error) throw error;
}
export async function respondLiveLocation(id: string, accept: boolean) {
  const { error } = await supabase.rpc('respond_live_location', {
    p_id: id,
    p_accept: accept,
    p_device_id: getDeviceId(),
  });
  if (error) throw error;
}
