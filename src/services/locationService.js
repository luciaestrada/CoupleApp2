import * as Location from 'expo-location';
import { supabase } from '../supabase/client';

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

async function getCoupleId(userId) {
  const { data, error } = await supabase
    .from('couple_members')
    .select('couple_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.couple_id || null;
}

async function publishLocation(coupleId, userId) {
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  const { error } = await supabase.from('locations').upsert(
    {
      couple_id: coupleId,
      user_id: userId,
      lat: location.coords.latitude,
      lng: location.coords.longitude,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'couple_id,user_id' }
  );
  if (error) throw error;
}

export function startLocationHeartbeat(userId) {
  let cancelled = false;
  let intervalId;

  async function start() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (cancelled || permission.status !== 'granted') return;
    const coupleId = await getCoupleId(userId);
    if (cancelled || !coupleId) return;
    await publishLocation(coupleId, userId);
    if (!cancelled) {
      intervalId = setInterval(
        () => publishLocation(coupleId, userId).catch(console.error),
        HEARTBEAT_INTERVAL_MS
      );
    }
  }

  start().catch(console.error);
  return () => {
    cancelled = true;
    if (intervalId) clearInterval(intervalId);
  };
}

export function watchUserLocation(userId, onChange) {
  let active = true;
  let coupleId;

  async function loadLocation() {
    coupleId ||= await getCoupleId(userId);
    if (!coupleId) return;
    const { data, error } = await supabase
      .from('locations')
      .select('lat,lng')
      .eq('couple_id', coupleId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    if (active && data) onChange(data.lat, data.lng);
  }

  loadLocation().catch(console.error);
  const channel = supabase
    .channel(`location-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'locations', filter: `user_id=eq.${userId}` },
      ({ new: location }) => {
        if (active && location?.couple_id === coupleId) onChange(location.lat, location.lng);
      }
    )
    .subscribe();

  return () => {
    active = false;
    supabase.removeChannel(channel);
  };
}
