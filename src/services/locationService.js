import { getDeviceId } from './deviceService';
import { supabase } from '../supabase/client';
import { watchQuery } from './realtimeService';

function normalizeLocation(row) {
  if (!row || !row.sharing) return null;
  return {
    lat: row.lat,
    lng: row.lng,
    updatedAt: row.captured_at,
    receivedAt: row.updated_at,
    accuracy: row.accuracy_m,
    speed: row.speed_mps,
    heading: row.heading,
    batteryLevel: row.battery_level,
    charging: row.charging,
    activity: row.activity,
    activityConfidence: row.activity_confidence,
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
  coupleId,
  userId,
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

export function watchLiveRequests(coupleId, handlers) {
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
export async function renewMapView(sessionId) {
  const { data, error } = await supabase.rpc('renew_map_view', {
    p_device_id: getDeviceId(), p_session_id: sessionId,
  });
  if (error) throw error;
  return data;
}
export async function endMapView(sessionId) {
  const { error } = await supabase.rpc('end_map_view', {
    p_device_id: getDeviceId(), p_session_id: sessionId,
  });
  if (error) throw error;
}
export async function respondLiveLocation(id, accept) {
  const { error } = await supabase.rpc('respond_live_location', {
    p_id: id,
    p_accept: accept,
    p_device_id: getDeviceId(),
  });
  if (error) throw error;
}
