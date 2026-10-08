import { asError, type AppError } from '../utils/errors';
import React, { useEffect, useRef, useState } from 'react';
import { useIsFocused, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import * as Crypto from 'expo-crypto';
import { startMapViewing } from '../features/location/mapViewing';
import { estimatePosition } from '../features/location/positionEstimate';
import {
  Platform,
  AppState,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { TouchableOpacity } from '@gorhom/bottom-sheet';
import OpenMap, { type OpenMapHandle } from '../features/map/OpenMap';
import type { Geofence, SharedLocation, Profile, Row, TrackingMode } from '../types/domain';
import type { MapViewState } from '../features/location/mapViewing';
import { colors } from '../ui/theme';
import MapOptionsSheet from '../ui/MapOptionsSheet';
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
  renewMapView,
  endMapView,
} from '../services/locationService';
import { watchProfile } from '../services/profileService';
import { watchGeofences } from '../services/geofenceService';
import { requestForegroundLocationPermission } from '../services/permissionService';
import { locationAgeLabel } from '../features/location/policy';
import { allowTracking } from '../features/location/trackingEngine';
import { haversineDistanceKm } from '../utils/haversine';
import { formatSharedDistance } from '../features/location/distanceLabel';

const coordinate = (point: { lat: number; lng: number }) => ({ latitude: point.lat, longitude: point.lng });
export default function MapScreen({ navigation }: { navigation: NavigationProp<ParamListBase> }) {
  const { userId, partnerId, couple } = usePairedAppContext();
  const tracking = useTracking();
  const mapAvailable =
    Platform.OS !== 'android' ||
    Constants.expoConfig?.extra?.androidMapsConfigured === true;
  const map = useRef<OpenMapHandle | null>(null);
  const [requests, setRequests] = useState<Row<'live_location_requests'>[]>([]);
  const [places, setPlaces] = useState<Geofence[]>([]);
  const [mine, setMine] = useState<SharedLocation | null>(null);
  const [partner, setPartner] = useState<SharedLocation | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [history, setHistory] = useState<Row<'location_history'>[] | null>(null);
  const historyRevision = useRef(0);
  const partnerPrecision = useRef<'off' | 'approximate' | 'precise' | null>(null);
  const [busy, setBusy] = useState(false);
  const optionsSheet = useRef<{ close(): void }>(null);
  const [partnerExpanded, setPartnerExpanded] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [ready, setReady] = useState(false);
  const [follow, setFollow] = useState(true);
  const focused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [viewing, setViewing] = useState<MapViewState>({ status: 'connecting' });
  useEffect(() => {
    const subscription = AppState.addEventListener('change', value => setAppActive(value === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!focused || !appActive) return undefined;
    const id = Crypto.randomUUID();
    return startMapViewing({
      renew: () => renewMapView(id), close: () => endMapView(id), onState: setViewing,
    });
  }, [focused, appActive, couple.id]);
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
      onData: value => {
        setPartner(value);
        const precision = !value ? 'off' : (value.accuracy ?? 0) >= 1000 ? 'approximate' : 'precise';
        if (precision !== partnerPrecision.current) {
          partnerPrecision.current = precision;
          historyRevision.current += 1;
          setHistory(null);
        }
      },
      onError: setError,
    });
    const stopProfile = watchProfile(partnerId, {
      onData: setProfile,
      onError: setError,
    });
    return () => {
      stopPlaces();
      stopRequests();
      stopMine();
      stopPartner();
      stopProfile();
    };
  }, [couple.id, partnerId, userId]);
  useEffect(() => {
    if (!focused || !appActive) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [focused, appActive]);
  useEffect(() => {
    if (!ready || !follow) return;
    const points = [mine, partner].filter((point): point is SharedLocation => point !== null).map(coordinate);
    if (points.length === 2)
      map.current?.fitToCoordinates(points, {
        edgePadding: { top: partnerExpanded ? 210 : 75, bottom: 100, left: 60, right: 60 },
        animated: true,
      });
    else if (points.length === 1)
      map.current?.animateToRegion({
        ...points[0],
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      });
  }, [mine, partner, ready, follow, partnerExpanded]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (next) {
      setError(asError(next));
    } finally {
      setBusy(false);
    }
  }
  async function enable(mode: TrackingMode) {
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
    Date.parse(tracking.settings.live_until ?? '') <= now;
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
  const shownPartner = viewing.status === 'requested' ? estimatePosition(partner, now) : partner;
  const partnerDetails = partner ? [
    locationAgeLabel(partner.updatedAt, now),
    [
      Number.isFinite(partner.batteryLevel) ? `${partner.batteryLevel} %${partner.charging ? ' · Cargando' : ''}` : 'Batería no compartida',
      ({ stationary: 'En reposo', walking: 'A pie', cycling: 'En bicicleta', driving: 'En vehículo' } as Record<string, string>)[partner.activity ?? ''],
      typeof partner.speed === 'number' && Number.isFinite(partner.speed) && partner.speed >= 0 ? `${Math.round(partner.speed * 3.6)} km/h` : null,
    ].filter(Boolean).join(' · '),
    [
      shownPartner && typeof shownPartner.accuracy === 'number' && Number.isFinite(shownPartner.accuracy) ? `±${Math.round(shownPartner.accuracy)} m` : null,
      shownPartner?.estimated ? 'Posición estimada' : null,
      partner.activityConfidence === 'low' && partner.activity !== 'unknown' ? 'Actividad estimada' : null,
    ].filter(Boolean).join(' · '),
    distance !== null ? `${fresh ? 'Distancia' : 'Última distancia'}: ${formatSharedDistance(distance, mine, partner)}` : null,
    (profile?.status?.text || profile?.status?.emoji) && Date.parse(profile.status.expiresAt ?? '') > now
      ? `${profile.status.emoji ?? ''} ${profile.status.text}` : null,
  ].filter((line): line is string => typeof line === 'string' && line.length > 0) : [];
  const compactDetails = partner ? [
    locationAgeLabel(partner.updatedAt, now),
    Number.isFinite(partner.batteryLevel) ? `Batería ${partner.batteryLevel} %${partner.charging ? ' · Cargando' : ''}` : null,
    ({ stationary: 'En reposo', walking: 'A pie', cycling: 'En bicicleta', driving: 'En vehículo' } as Record<string, string>)[partner.activity ?? ''],
    typeof partner.speed === 'number' && Number.isFinite(partner.speed) && partner.speed >= 0 ? `${Math.round(partner.speed * 3.6)} km/h` : null,
    ...partnerDetails.slice(2),
  ].filter(Boolean) : [];
  const compactInfo = compactDetails[Math.floor(now / 5000) % Math.max(1, compactDetails.length)] ?? '';
  const partnerSummary = [
    profile?.name ?? 'Tu pareja',
    shownPartner?.estimated ? 'Estimación' : null,
    partner && now - Date.parse(partner.updatedAt) >= 120000 ? 'Ubicación antigua' : null,
    compactInfo,
  ].filter(Boolean).join(' · ');


  return (
    <View style={styles.container}>
      <View style={styles.mapContainer}>
        {mapAvailable ? (
          <MapView
            ref={instance => { map.current = instance; }}
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
                point: shownPartner,
                title: profile?.name ?? 'Tu pareja',
                color: '#4263EB',
                details: partnerDetails,
              },
            ].map(
              ({ point, title, color, details }) =>
                point && (
                  <React.Fragment key={title}>
                    <Marker
                      coordinate={coordinate(point)}
                      title={details ? undefined : title}
                      description={details ? undefined : locationAgeLabel(point.updatedAt, now)}
                      pinColor={color}
                      onPress={details ? () => setPartnerExpanded(value => !value) : undefined}
                      accessibilityLabel={details ? `${partnerSummary}. ${partnerExpanded ? 'Ocultar' : 'Mostrar'} detalles` : title}
                      anchor={details ? { x: 0.5, y: 1 } : undefined}
                    >
                      {details && <View style={styles.partnerMarker} collapsable={false}>
                        <View style={styles.markerCard}>
                          {partnerExpanded ? <>
                            <Text style={styles.markerTitle} numberOfLines={1}>{title}</Text>
                            {details.map((line, index) => <Text key={index} style={styles.markerDetail} numberOfLines={2}>{line}</Text>)}
                          </> : <Text style={styles.markerSummary} numberOfLines={1}>{partnerSummary}</Text>}

                        </View>
                        <View style={styles.markerStem} />
                        <View style={styles.markerDot} />
                      </View>}
                    </Marker>
                    {typeof point.accuracy === 'number' && point.accuracy > 0 && (
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
            {history && history.length > 1 && !history.some(point => point.approximate) && (
              <Polyline
                coordinates={history.map(coordinate)}
                strokeColor="#4263EB"
                strokeWidth={3}
              />
            )}
            {history?.filter(point => point.approximate).map(point => <Circle key={point.id}
              center={coordinate(point)} radius={point.accuracy_m ?? 2000}
              strokeColor="#4263EB" fillColor="#4263EB10" />)}
          </MapView>
        ) : (
          <OpenMap
            onMarkerPress={id => { if (id === partnerId) setPartnerExpanded(value => !value); }}
            ref={map}
            style={styles.map}
            onMapReady={() => setReady(true)}
            onPanDrag={() => setFollow(false)}
            points={[
              ...places.map((p) => ({
                ...p,
                title: p.name,
                color: '#176647',
                radius: p.radiusMeters,
              })),
              ...[
                { point: mine, title: 'Tú', color: '#A62450' },
                {
                  point: shownPartner,
                  title: profile?.name ?? 'Tu pareja',
                  color: '#4263EB',
                  details: partnerDetails,
                },
              ]
                .filter((p): p is typeof p & { point: SharedLocation } => p.point !== null)
                .map(({ point, title, color, details }) => ({
                  ...point,
                  title: point.estimated ? `${title} · Posición estimada` : title,
                  color,
                  radius: point.accuracy,
                  details,
                  id: details ? partnerId : undefined,
                  expanded: details ? partnerExpanded : undefined,
                  summary: details ? partnerSummary : undefined,
                })),
            ]}
            history={history ?? []}
          />
        )}
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.recenter}
          onPress={() => setFollow((value) => !value)}
        >
          <Text>{follow ? 'Explorar mapa' : 'Centrar ubicaciones'}</Text>
        </TouchableOpacity>
      </View>
      <MapOptionsSheet ref={optionsSheet} renderCompact={() => (
      <View style={styles.toolbar}>
        <View style={styles.flex}>
          {!partner && <Text style={styles.muted}>Tu pareja aún no comparte ubicación</Text>}
          <Text style={styles.toolbarTitle}>Tu ubicación · {mode === 'off' ? 'Pausada' : mode === 'live' ? 'En vivo' : 'Bajo consumo'}</Text>
          {mode !== 'off' && Date.parse(tracking.autoLiveUntil ?? '') > now &&
            <Text style={styles.muted}>Tu pareja está mirando el mapa</Text>}
          {requests.some(item => item.target_id === userId && item.status === 'pending' && Date.parse(item.expires_at) > now) &&
            <Text style={styles.muted}>Solicitud pendiente · Desliza hacia arriba</Text>}
        </View>
        <TouchableOpacity accessibilityRole="button" disabled={busy}
          accessibilityLabel={mode === 'off' ? 'Compartir mi ubicación' : 'Pausar mi ubicación'}
          style={styles.quickButton} onPress={() => run(() => enable(mode === 'off' ? 'balanced' : 'off'))}>
          {busy ? <ActivityIndicator color={colors.primary} /> :
            <Text style={styles.linkText}>{mode === 'off' ? 'Compartir' : 'Pausar'}</Text>}
        </TouchableOpacity>
      </View>
      )}>
      <View style={{ padding: 16, paddingBottom: 32, gap: 10 }}>

        <Text accessibilityLiveRegion="polite" style={styles.muted}>
          {{
            connecting: 'Solicitando actualización al otro móvil…',
            requested: 'Sesión automática solicitada. La hora de la posición indica si el otro móvil ya está respondiendo.',
            consent_required: 'Tu pareja puede autorizar las sesiones automáticas en Ajustes → Ubicación y privacidad.',
            paused: 'Tu pareja tiene la ubicación pausada. Abrir el mapa no la reactiva.',
            expired: 'La sesión automática ha terminado tras 15 minutos. Sal del mapa y vuelve a entrar para solicitar otra.',
            offline: 'No se pudo solicitar la sesión automática. Se reintentará mientras el mapa esté abierto.',
          }[viewing.status]}
        </Text>
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
          {mode !== 'off' && Date.parse(tracking.autoLiveUntil ?? '') > now
            ? 'Tu pareja está mirando el mapa'
            : mode === 'off'
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
                (Date.parse(tracking.settings.live_until ?? '') - now) / 60000,
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
        <Text style={styles.muted}>
          {mode === 'live'
            ? 'La sesión solicita más precisión durante 15 minutos. El ahorro de batería puede reducir la frecuencia.'
            : 'Bajo consumo usa la ubicación del sistema y espacia las actualizaciones. La posición puede tardar varios minutos en cambiar.'}
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
          {([
            ['balanced', 'Compartir'],
            ['live', 'En vivo 15 min'],
            ['off', 'Pausar'],
          ] as const).map(([value, label]) => (
            <TouchableOpacity
              key={value}
              accessibilityRole="button"
              disabled={busy || value === mode}
              accessibilityState={{
                selected: value === mode,
                disabled: busy || value === mode,
              }}
              style={[styles.button, value === mode && { opacity: 0.5 }]}
              onPress={() => run(() => enable(value))}
            >
              <Text style={styles.buttonText}>
                {value === mode ? label + ' ✓' : label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity onPress={() => { optionsSheet.current?.close(); navigation.navigate('Ajustes'); }}>
          <Text style={styles.link}>Ajustes de ubicación y privacidad</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { optionsSheet.current?.close(); navigation.navigate('Lugares'); }}>
          <Text style={styles.link}>Mis lugares y avisos de llegada</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={busy}
          onPress={() =>
            run(async () => {
              if (history) { setHistory(null); return; }
              const revision = historyRevision.current;
              const points = await getLocationHistory(couple.id, partnerId);
              if (revision === historyRevision.current) setHistory(points);
            })
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
              ? `${history.length} ${history.some(point => point.approximate) ? 'zonas aproximadas; no representan un recorrido exacto' : 'puntos. Muestreo cada 15 minutos'}.`
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
      </View>
      </MapOptionsSheet>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF8FA' },
  mapContainer: { flex: 1 },
  map: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  partnerMarker: { width: 224, alignItems: 'center' },
  markerCard: { width: 220, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: '#4263EB', padding: 10 },
  markerSummary: { fontSize: 12, color: colors.text },
  markerTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 3 },
  markerDetail: { fontSize: 12, lineHeight: 16, color: colors.muted },
  markerStem: { width: 2, height: 8, backgroundColor: '#4263EB' },
  markerDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: '#fff', backgroundColor: '#4263EB' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12,
    paddingVertical: 6, backgroundColor: colors.surface },
  toolbarTitle: { color: colors.text, fontSize: 13, fontWeight: '600' },
  quickButton: { minHeight: 48, minWidth: 48, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  linkText: { color: colors.primary, fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '700', color: '#8A2846' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  flex: { flex: 1 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 13,
    minHeight: 48,
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  muted: { color: '#666', fontSize: 12 },
  error: { color: '#B42318' },
  link: { color: '#8A2846', paddingVertical: 8 },
  recenter: {
    position: 'absolute',
    right: 12,
    bottom: 125,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
  },
});
