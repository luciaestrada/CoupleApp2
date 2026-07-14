import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { doc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

export const GEOFENCE_TASK = 'GEOFENCE_TASK';
export const LOCATION_UPDATE_TASK = 'LOCATION_UPDATE_TASK';

// Se dispara al entrar/salir de una zona registrada con Location.startGeofencingAsync
TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
  if (error) return;
  const { eventType, region } = data;

  if (eventType === Location.GeofencingEventType.Enter) {
    // Escribe un evento en Firestore; una Cloud Function envía la notificación push a la pareja
    const coupleId = region.state?.coupleId;
    const userId = region.state?.userId;
    if (coupleId && userId) {
      await addDoc(collection(db, 'couples', coupleId, 'geofenceEvents'), {
        userId,
        placeName: region.identifier,
        eventType: 'enter',
        createdAt: serverTimestamp(),
      });
    }
  }
});

export async function registerGeofences(geofences, coupleId, userId) {
  const regions = geofences.map((g) => ({
    identifier: g.name,
    latitude: g.lat,
    longitude: g.lng,
    radius: g.radiusMeters || 150,
    notifyOnEnter: true,
    notifyOnExit: false,
    state: { coupleId, userId },
  }));
  await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
}
