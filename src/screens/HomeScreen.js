import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { usePairedAppContext } from '../contexts/AppContext';
import { sendLove, watchStreaks } from '../services/streakService';
import { startLocationHeartbeat, watchUserLocation } from '../services/locationService';
import { haversineDistanceKm } from '../utils/haversine';
import { daysTogether, isStreakBroken, todayInMadrid } from '../utils/dateUtils';
import {
  getForegroundLocationPermission,
  getLocationServicesPermission,
  permissionNeedsSettings,
  requestForegroundLocationPermission,
  requestLocationServicesPermission,
} from '../services/permissionService';
import { showLocationSettingsAlert, showPermissionSettingsAlert } from '../utils/permissionUi';

const LOCATION_FRESHNESS_MS = 15 * 60 * 1000;

export default function HomeScreen() {
  const { userId, couple, partnerId } = usePairedAppContext();
  const [streaks, setStreaks] = useState(couple.streaks ?? []);
  const [myCoords, setMyCoords] = useState(null);
  const [partnerCoords, setPartnerCoords] = useState(null);
  const [error, setError] = useState(null);
  const [sendingLove, setSendingLove] = useState(false);
  const [locationPermission, setLocationPermission] = useState(null);
  const [locationServices, setLocationServices] = useState(null);
  const [locationHeartbeatRevision, setLocationHeartbeatRevision] = useState(0);
  const [requestingLocation, setRequestingLocation] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    return watchStreaks(couple.id, { onData: setStreaks, onError: setError });
  }, [couple?.id]);

  // Publica mi ubicación periódicamente
  useEffect(() => {
    return startLocationHeartbeat({
      onError: setError,
      onPermissionAvailable: setLocationPermission,
      onPermissionUnavailable: setLocationPermission,
      onServicesAvailable: setLocationServices,
      onServicesUnavailable: setLocationServices,
    });
  }, [locationHeartbeatRevision, userId]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void Promise.all([getLocationServicesPermission(), getForegroundLocationPermission()])
        .then(([services, permission]) => {
          setLocationServices(services);
          setLocationPermission(permission);
          if (services.granted && permission.granted) {
            setLocationHeartbeatRevision((revision) => revision + 1);
          }
        })
        .catch(setError);
    });
    return () => subscription.remove();
  }, []);

  // Escucha mi propia ubicación publicada (para tener el mismo dato que ve la pareja)
  useEffect(() => {
    return watchUserLocation(couple.id, userId, { onData: setMyCoords, onError: setError });
  }, [couple.id, userId]);

  // Escucha la ubicación de la pareja
  useEffect(() => {
    return watchUserLocation(couple.id, partnerId, {
      onData: setPartnerCoords,
      onError: setError,
    });
  }, [couple.id, partnerId]);

  function getDistanceText() {
    if (locationServices && !locationServices.granted) return 'Servicios de ubicación apagados';
    if (locationPermission && !locationPermission.granted) return 'Ubicación desactivada';
    if (!myCoords) return 'Esperando tu ubicación';
    if (!partnerCoords) return 'Esperando a tu pareja';

    const oldestUpdate = Math.min(
      new Date(myCoords.updatedAt).getTime(),
      new Date(partnerCoords.updatedAt).getTime()
    );
    if (oldestUpdate + LOCATION_FRESHNESS_MS < now) return 'Ubicación sin actualizar';

    const distanceKm = haversineDistanceKm(
      myCoords.lat,
      myCoords.lng,
      partnerCoords.lat,
      partnerCoords.lng
    );
    return distanceKm < 1
      ? `${Math.round(distanceKm * 1000)} m`
      : `${distanceKm.toFixed(1)} km`;
  }

  async function handleSendLove() {
    setSendingLove(true);
    setError(null);
    try {
      await sendLove(couple.id);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setSendingLove(false);
    }
  }

  async function handleEnableLocation() {
    setRequestingLocation(true);
    setError(null);
    try {
      let services = await getLocationServicesPermission();
      if (!services.granted) {
        services = await requestLocationServicesPermission();
      }
      setLocationServices(services);
      if (!services.granted) {
        showLocationSettingsAlert(
          'Activa los servicios de ubicación',
          'La ubicación del dispositivo está apagada. Actívala para calcular la distancia.'
        );
        return;
      }
      const current = await getForegroundLocationPermission();
      if (permissionNeedsSettings(current)) {
        showPermissionSettingsAlert(
          'Activa la ubicación',
          'El permiso está bloqueado. Ábrelo en Ajustes para poder calcular la distancia.'
        );
        setLocationPermission(current);
        return;
      }

      const permission = current.granted
        ? current
        : await requestForegroundLocationPermission();
      setLocationPermission(permission);
      if (permission.granted) {
        setLocationHeartbeatRevision((revision) => revision + 1);
      } else if (permissionNeedsSettings(permission)) {
        showPermissionSettingsAlert(
          'Activa la ubicación',
          'El permiso está bloqueado. Ábrelo en Ajustes para poder calcular la distancia.'
        );
      } else {
        Alert.alert('Ubicación no activada', 'Puedes volver a intentarlo cuando quieras.');
      }
    } catch (nextError) {
      setError(nextError);
    } finally {
      setRequestingLocation(false);
    }
  }

  const myStreak = streaks.find((streak) => streak.userId === userId) ?? {
    count: 0,
    lastConfirmedDay: null,
  };
  const partnerStreak = streaks.find((streak) => streak.userId === partnerId) ?? {
    count: 0,
    lastConfirmedDay: null,
  };
  const sentLoveToday = myStreak.lastConfirmedDay === todayInMadrid();

  return (
    <View style={styles.container}>
      <Text style={styles.daysCounter}>
        💞 {daysTogether(couple.startDate)} días juntos
      </Text>

      {error && <Text style={styles.error}>{error.message}</Text>}

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Rachas de amor</Text>
        <View style={styles.streakRow}>
          <View style={styles.streakColumn}>
            <Text style={styles.streakOwner}>Tú</Text>
            <Text style={styles.streakNumber}>🔥 {myStreak.count}</Text>
            {myStreak.count > 0 && isStreakBroken(myStreak.lastConfirmedDay) && (
              <Text style={styles.brokenText}>Racha interrumpida</Text>
            )}
          </View>
          <View style={styles.streakDivider} />
          <View style={styles.streakColumn}>
            <Text style={styles.streakOwner}>Tu pareja</Text>
            <Text style={styles.streakNumber}>🔥 {partnerStreak.count}</Text>
            {partnerStreak.count > 0 && isStreakBroken(partnerStreak.lastConfirmedDay) && (
              <Text style={styles.brokenText}>Racha interrumpida</Text>
            )}
          </View>
        </View>
        <TouchableOpacity
          style={styles.loveButton}
          disabled={sendingLove || sentLoveToday}
          onPress={handleSendLove}
        >
          {sendingLove ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.loveButtonText}>
              {sentLoveToday ? 'Amor enviado hoy ✓' : 'Enviar amor de hoy 💜'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Distancia</Text>
        <Text style={styles.distanceText}>{getDistanceText()}</Text>
        {((locationServices && !locationServices.granted) ||
          (locationPermission && !locationPermission.granted)) && (
          <TouchableOpacity
            disabled={requestingLocation}
            onPress={handleEnableLocation}
            style={styles.permissionButton}
          >
            <Text style={styles.permissionButtonText}>
              {requestingLocation ? 'Comprobando…' : 'Activar ubicación'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  daysCounter: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
    color: '#FF6B81',
  },
  card: {
    backgroundColor: '#FFF0F3',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  cardLabel: { fontSize: 14, color: '#888', marginBottom: 8 },
  streakRow: { alignItems: 'stretch', flexDirection: 'row', marginBottom: 16, width: '100%' },
  streakColumn: { alignItems: 'center', flex: 1, minHeight: 70 },
  streakDivider: { backgroundColor: '#F9A8C4', width: 1 },
  streakOwner: { color: '#777', fontSize: 13, fontWeight: '700', marginBottom: 4 },
  streakNumber: { fontSize: 28, fontWeight: '800' },
  brokenText: { color: '#B42318', fontSize: 11, marginTop: 3 },
  loveButton: {
    backgroundColor: '#FF6B81',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  loveButtonText: { color: '#fff', fontWeight: '700' },
  distanceText: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  permissionButton: { marginTop: 12, paddingHorizontal: 14, paddingVertical: 8 },
  permissionButtonText: { color: '#D6336C', fontWeight: '700' },
  error: { color: '#B42318', marginBottom: 12, textAlign: 'center' },
});
