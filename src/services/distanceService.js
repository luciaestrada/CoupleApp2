import * as Location from 'expo-location';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

export async function requestLocationPermissions() {
  const { status: fg } = await Location.requestForegroundPermissionsAsync();
  if (fg !== 'granted') return false;
  const { status: bg } = await Location.requestBackgroundPermissionsAsync();
  return bg === 'granted';
}

export async function updateMyLocation(coupleId, userId) {
  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  await setDoc(doc(db, 'couples', coupleId, 'locations', userId), {
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    updatedAt: serverTimestamp(),
  });
}

// Fórmula de Haversine para calcular distancia en km entre dos coordenadas
export function calculateDistanceKm(coordsA, coordsB) {
  if (!coordsA || !coordsB) return null;
  const R = 6371;
  const dLat = toRad(coordsB.lat - coordsA.lat);
  const dLng = toRad(coordsB.lng - coordsA.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(coordsA.lat)) * Math.cos(toRad(coordsB.lat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}
