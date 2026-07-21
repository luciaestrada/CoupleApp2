import * as Location from 'expo-location';
import { supabase } from '../supabase/client';

export async function requestLocationPermissions() {
  const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
  if (foregroundStatus !== 'granted') return false;
  const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
  return backgroundStatus === 'granted';
}

export async function updateMyLocation(coupleId, userId) {
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

export function calculateDistanceKm(coordsA, coordsB) {
  if (!coordsA || !coordsB) return null;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(coordsB.lat - coordsA.lat);
  const longitudeDelta = toRadians(coordsB.lng - coordsA.lng);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(coordsA.lat)) *
      Math.cos(toRadians(coordsB.lat)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}
