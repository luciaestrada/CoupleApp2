import React, { useEffect, useRef, useState } from 'react';
import {
  Platform,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import MapView, { Circle, Marker, Polyline } from 'react-native-maps';
import { usePairedAppContext } from '../contexts/AppContext';
import { useTracking } from '../context/TrackingContext';
import {
  watchUserLocation,
  getLocationHistory,
  clearLocationHistory,
  watchLiveRequests,
  requestLiveLocation,
  respondLiveLocation,
} from '../services/locationService';
import { watchProfile } from '../services/profileService';
import { watchGeofences } from '../services/geofenceService';
import { requestForegroundLocationPermission } from '../services/permissionService';
import { locationAgeLabel } from '../features/location/policy';
import { allowTracking } from '../features/location/trackingEngine';
import { haversineDistanceKm } from '../utils/haversine';

const coordinate = (point) => ({ latitude: point.lat, longitude: point.lng });
export default function MapScreen({ navigation }) {
  const { userId, partnerId, couple } = usePairedAppContext();
  const tracking = useTracking();
  const mapAvailable =
    Platform.OS !== 'android' ||
    Constants.expoConfig?.extra?.androidMapsConfigured === true;
  const map = useRef(null);
  const [requests, setRequests] = useState([]);
  const [places, setPlaces] = useState([]);
  const [mine, setMine] = useState(null);
  const [partner, setPartner] = useState(null);
  const [profile, setProfile] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [history, setHistory] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  const [follow, setFollow] = useState(true);
  useEffect(() => {
    const stopPlaces = watchGeofences(couple.id, userId, {
      onData: setPlaces,
      onError: setError,
    });
    const stopRequests = watchLiveRequests(couple.id, {
      onData: setRequests,
      onError: setError,
    });
    const stopMine = watchUserLocation(couple.id, userId, {
      onData: setMine,
      onError: setError,
    });
    const stopPartner = watchUserLocation(couple.id, partnerId, {
      onData: setPartner,
      onError: setError,
    });
    const stopProfile = watchProfile(partnerId, {
      onData: setProfile,
      onError: setError,
    });
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      stopPlaces();
      stopRequests();
      stopMine();
      stopPartner();
      stopProfile();
      clearInterval(timer);
    };
  }, [couple.id, partnerId, userId]);
  useEffect(() => {
    if (!ready || !follow) return;
    const points = [mine, partner].filter(Boolean).map(coordinate);
    if (points.length === 2)
      map.current?.fitToCoordinates(points, {
        edgePadding: { top: 60, bottom: 60, left: 60, right: 60 },
        animated: true,
      });
    else if (points.length === 1)
      map.current?.animateToRegion({
        ...points[0],
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      });
  }, [mine, partner, ready, follow]);
  async function run(action) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (next) {
      setError(next);
    } finally {
      setBusy(false);
    }
  }
  async function enable(mode) {
    if (mode !== 'off') {
      const permission = await requestForegroundLocationPermission();
      if (!permission.granted)
        throw new Error(
          'Activa el permiso de ubicación en Ajustes o en los Ajustes del teléfono.',
        );
    }
    await tracking.update({ location_mode: mode });
  }
  const expired =
    tracking.settings.location_mode === 'live' &&
    Date.parse(tracking.settings.live_until) <= now;
  const mode = expired ? 'off' : tracking.settings.location_mode;
  const fresh =
    mine &&
    partner &&
    [mine, partner].every(
      (point) => now - Date.parse(point.updatedAt) < 120_000,
    );
  const distance =
    mine && partner
      ? haversineDistanceKm(mine.lat, mine.lng, partner.lat, partner.lng)
      : null;
  return (
    <View style={styles.container}>
      <View style={styles.mapContainer}>
        {mapAvailable ? (
          <MapView
            ref={map}
            style={styles.map}
            onMapReady={() => setReady(true)}
            onPanDrag={() => setFollow(false)}
            initialRegion={{
              latitude: 40.4168,
              longitude: -3.7038,
              latitudeDelta: 20,
              longitudeDelta: 20,
            }}
          >
            {places.map((place) => (
              <React.Fragment key={place.id}>
                <Marker
                  coordinate={coordinate(place)}
                  title={place.name}
                  description={`Aviso de llegada · ${place.radiusMeters} m`}
                  pinColor="#12B76A"
                />
                <Circle
                  center={coordinate(place)}
                  radius={place.radiusMeters}
                  strokeColor="#12B76A"
                  fillColor="#12B76A15"
                />
              </React.Fragment>
            ))}
            {[
              { point: mine, title: 'Tú', color: '#D6336C' },
              {
                point: partner,
                title: profile?.name ?? 'Tu pareja',
                color: '#4263EB',
              },
            ].map(
              ({ point, title, color }) =>
                point && (
                  <React.Fragment key={title}>
                    <Marker
                      coordinate={coordinate(point)}
                      title={title}
                      description={locationAgeLabel(point.updatedAt, now)}
                      pinColor={color}
                    />
                    {point.accuracy > 0 && (
                      <Circle
                        center={coordinate(point)}
                        radius={point.accuracy}
                        strokeColor={color}
                        fillColor={`${color}20`}
                      />
                    )}
                  </React.Fragment>
                ),
            )}
            {history?.length > 1 && (
              <Polyline
                coordinates={history.map(coordinate)}
                strokeColor="#4263EB"
                strokeWidth={3}
              />
            )}
          </MapView>
        ) : (
          <View style={{ padding: 24 }}>
            <Text>
              El mapa no está disponible en esta instalación. Puedes consultar
              los datos de ubicación en la ficha.
            </Text>
          </View>
        )}
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.recenter}
          onPress={() => setFollow((value) => !value)}
        >
          <Text>{follow ? 'Explorar mapa' : 'Centrar ubicaciones'}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        style={styles.panel}
        contentContainerStyle={{ padding: 16, gap: 10 }}
      >
        <View style={styles.row}>
          {!!profile?.avatarUrl && (
            <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
          )}
          <View>
            <Text style={styles.title}>{profile?.name ?? 'Tu pareja'}</Text>
            <Text>
              {partner
                ? locationAgeLabel(partner.updatedAt, now)
                : 'Sin ubicación compartida disponible'}
            </Text>
          </View>
        </View>
        {partner && (
          <Text>
            Precisión aproximada: ±{Math.round(partner.accuracy ?? 0)} m
            {partner.speed >= 0 && partner.speed != null
              ? ` · ${(partner.speed * 3.6).toFixed(0)} km/h`
              : ''}
          </Text>
        )}
        {!!profile?.status?.text &&
          Date.parse(profile.status.updatedAt) > now - 86400_000 && (
            <Text>
              {profile.status.emoji} {profile.status.text}
            </Text>
          )}
        {distance !== null && (
          <Text>
            {fresh ? 'Distancia' : 'Distancia entre las últimas posiciones'}:{' '}
            {distance < 1
              ? `${Math.round(distance * 1000)} m`
              : `${distance.toFixed(1)} km`}
          </Text>
        )}
        <TouchableOpacity
          disabled={busy}
          onPress={() => run(requestLiveLocation)}
        >
          <Text style={styles.link}>Pedir a tu pareja una sesión en vivo</Text>
        </TouchableOpacity>
        {requests
          .filter((item) => Date.parse(item.expires_at) > now)
          .map((item) => (
            <View key={item.id}>
              <Text>
                {item.requester_id === userId
                  ? 'Tu solicitud'
                  : 'Tu pareja solicita una sesión de 15 minutos'}
                :{' '}
                {
                  {
                    pending: 'pendiente',
                    accepted: 'aceptada',
                    declined: 'rechazada',
                  }[item.status]
                }
              </Text>
              {item.target_id === userId && item.status === 'pending' && (
                <View style={styles.row}>
                  <TouchableOpacity
                    disabled={busy}
                    onPress={() =>
                      run(async () => {
                        const permission =
                          await requestForegroundLocationPermission();
                        if (!permission.granted)
                          throw new Error(
                            'Activa primero el permiso de ubicación.',
                          );
                        allowTracking(userId);
                        await respondLiveLocation(item.id, true);
                      })
                    }
                  >
                    <Text style={styles.link}>Aceptar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={busy}
                    onPress={() =>
                      run(() => respondLiveLocation(item.id, false))
                    }
                  >
                    <Text style={styles.link}>Rechazar</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
        <Text style={styles.title}>
          Tu ubicación ·{' '}
          {mode === 'off'
            ? 'Pausada'
            : mode === 'live'
              ? 'Sesión en vivo'
              : 'Bajo consumo'}
        </Text>
        {mode === 'live' && (
          <Text>
            Finaliza en{' '}
            {Math.max(
              0,
              Math.ceil(
                (Date.parse(tracking.settings.live_until) - now) / 60000,
              ),
            )}{' '}
            min
          </Text>
        )}
        <Text>
          Estado:{' '}
          {
            {
              paused: 'pausado',
              waiting: 'esperando posición',
              sharing: 'compartiendo',
              offline: 'pendiente de conexión',
              unavailable: 'no disponible',
            }[tracking.status]
          }
        </Text>
        {mine && (
          <Text>
            Tu última publicación: {locationAgeLabel(mine.updatedAt, now)}
          </Text>
        )}
        {(error || tracking.error) && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error?.message ?? tracking.error}
          </Text>
        )}
        <View style={styles.row}>
          {[
            ['balanced', 'Compartir'],
            ['live', 'En vivo 15 min'],
            ['off', 'Pausar'],
          ].map(([value, label]) => (
            <TouchableOpacity
              key={value}
              accessibilityRole="button"
              disabled={busy}
              style={styles.button}
              onPress={() => run(() => enable(value))}
            >
              <Text style={styles.buttonText}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Ajustes')}>
          <Text style={styles.link}>Ajustes de ubicación y privacidad</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Lugares')}>
          <Text style={styles.link}>Mis lugares y avisos de llegada</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={busy}
          onPress={() =>
            run(async () =>
              setHistory(
                history ? null : await getLocationHistory(couple.id, partnerId),
              ),
            )
          }
        >
          <Text style={styles.link}>
            {history ? 'Ocultar' : 'Ver'} historial aproximado de tu pareja (24
            h)
          </Text>
        </TouchableOpacity>
        {history && (
          <Text>
            {history.length
              ? `${history.length} puntos. Muestreo aproximado cada 15 minutos.`
              : 'No hay historial compartido en las últimas 24 horas.'}
          </Text>
        )}
        <TouchableOpacity
          disabled={busy}
          onPress={() =>
            Alert.alert(
              'Borrar tu historial',
              'Se eliminarán tus posiciones guardadas.',
              [
                { text: 'Cancelar' },
                {
                  text: 'Borrar',
                  style: 'destructive',
                  onPress: () => run(clearLocationHistory),
                },
              ],
            )
          }
        >
          <Text style={styles.link}>Borrar mi historial</Text>
        </TouchableOpacity>
        {busy && <ActivityIndicator color="#D6336C" />}
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF8FA' },
  mapContainer: { flex: 1, minHeight: 200 },
  map: { ...StyleSheet.absoluteFillObject },
  panel: { flex: 1 },
  title: { fontSize: 17, fontWeight: '700', color: '#8A2846' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  flex: { flex: 1 },
  button: { backgroundColor: '#D6336C', borderRadius: 12, padding: 11 },
  buttonText: { color: '#fff', fontWeight: '600' },
  muted: { color: '#666', fontSize: 12 },
  error: { color: '#B42318' },
  link: { color: '#8A2846', paddingVertical: 8 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  recenter: {
    position: 'absolute',
    right: 12,
    top: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
  },
});
