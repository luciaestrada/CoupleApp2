import React, { useEffect, useState, useRef } from 'react';
import {
  Alert,
  AppState,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import OpenMap from '../features/map/OpenMap';
import MapView, { Marker, Circle } from 'react-native-maps';
import { usePairedAppContext } from '../contexts/AppContext';
import {
  createGeofence,
  deleteGeofence,
  MAX_GEOFENCE_REGIONS,
  syncGeofences,
  watchGeofences,
} from '../services/geofenceService';
import {
  getBackgroundLocationPermission,
  requestForegroundLocationPermission,
  requestBackgroundLocationPermission,
} from '../services/permissionService';
import {
  confirmBackgroundLocationRequest,
  showPermissionSettingsAlert,
} from '../utils/permissionUi';

export default function GeofenceSetupScreen() {
  const { userId, couple } = usePairedAppContext();
  const [name, setName] = useState('');
  const [radius, setRadius] = useState('150');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [places, setPlaces] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  const map = useRef(null);
  const mapAvailable =
    Platform.OS !== 'android' ||
    Constants.expoConfig?.extra?.androidMapsConfigured === true;
  const lat = Number(latitude.replace(',', '.')),
    lng = Number(longitude.replace(',', '.'));
  const hasPoint =
    latitude.trim() !== '' &&
    longitude.trim() !== '' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180;
  const meters = Number(radius);
  useEffect(
    () =>
      watchGeofences(couple.id, userId, {
        onData: setPlaces,
        onError: setError,
      }),
    [couple.id, userId],
  );
  useEffect(() => {
    let active = true;
    const refresh = () =>
      getBackgroundLocationPermission()
        .then((p) => {
          if (active) setMonitoring(p.granted);
        })
        .catch((e) => {
          if (active) setError(e);
        });
    void refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
  async function run(action) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  function selectPoint(point) {
    setLatitude(String(point.latitude));
    setLongitude(String(point.longitude));
  }
  async function locate() {
    const permission = await requestForegroundLocationPermission();
    if (!permission.granted) {
      if (!permission.canAskAgain)
        showPermissionSettingsAlert(
          'Permite la ubicación',
          'Puedes activarla desde los ajustes del teléfono.',
        );
      return;
    }
    if (!(await Location.hasServicesEnabledAsync()))
      throw new Error(
        'Activa la ubicación del teléfono para usar tu posición actual.',
      );
    const position =
      (await Location.getLastKnownPositionAsync({
        maxAge: 30000,
        requiredAccuracy: 100,
      })) ??
      (await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }));
    selectPoint(position.coords);
    map.current?.animateToRegion({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
  }
  async function save() {
    if (!name.trim()) throw new Error('Escribe un nombre para el lugar.');
    if (!hasPoint)
      throw new Error(
        'Selecciona un punto en el mapa, usa tu ubicación o introduce coordenadas válidas.',
      );
    if (!Number.isInteger(meters) || meters < 50 || meters > 1000)
      throw new Error(
        'El radio debe ser un número entero entre 50 y 1000 metros.',
      );
    if (places.length >= MAX_GEOFENCE_REGIONS)
      throw new Error(`Puedes guardar hasta ${MAX_GEOFENCE_REGIONS} lugares.`);
    const place = await createGeofence({
      name,
      lat,
      lng,
      radiusMeters: meters,
    });
    const updated = [...places.filter((p) => p.id !== place.id), place];
    setPlaces(updated);
    setName('');
    const synced = await syncGeofences(updated);
    setMonitoring(synced);
    if (!synced)
      Alert.alert(
        'Lugar guardado',
        'Puedes activar los avisos de llegada cuando quieras. Necesitan permiso de ubicación permanente.',
      );
  }
  async function enableArrivals() {
    if (!(await confirmBackgroundLocationRequest())) return;
    const permission = await requestBackgroundLocationPermission();
    if (!permission.background.granted) {
      if (!permission.background.canAskAgain)
        showPermissionSettingsAlert(
          'Ubicación permanente',
          'Permite la ubicación siempre para detectar llegadas.',
        );
      setMonitoring(false);
      return;
    }
    setMonitoring(await syncGeofences(places));
  }
  function remove(place) {
    Alert.alert('Eliminar lugar', `¿Quieres eliminar “${place.name}”?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () =>
          run(async () => {
            await deleteGeofence(place.id);
            const updated = places.filter((p) => p.id !== place.id);
            setPlaces(updated);
            await syncGeofences(updated);
          }),
      },
    ]);
  }
  return (
    <FlatList
      style={styles.page}
      contentContainerStyle={{ paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
      data={places}
      keyExtractor={(p) => p.id}
      ListHeaderComponent={
        <>
          <Text style={styles.title}>Mis lugares</Text>
          <Text style={styles.hint}>
            Guarda casa, trabajo u otro sitio. Tu pareja recibirá un aviso
            cuando llegues si activas la detección y sus notificaciones.
          </Text>
          <Text style={styles.hint}>
            {monitoring
              ? 'Permiso permanente concedido. La detección depende de los servicios de ubicación del teléfono.'
              : 'Avisos de llegada inactivos. Puedes guardar lugares sin acceso permanente.'}
          </Text>
          <TouchableOpacity
            disabled={busy}
            style={styles.secondary}
            onPress={() => run(enableArrivals)}
          >
            <Text>Activar o comprobar avisos de llegada</Text>
          </TouchableOpacity>
          {mapAvailable ? (
            <MapView
              ref={map}
              style={{ height: 240, marginVertical: 12 }}
              initialRegion={{
                latitude: 40.4168,
                longitude: -3.7038,
                latitudeDelta: 0.15,
                longitudeDelta: 0.15,
              }}
              onPress={(event) => selectPoint(event.nativeEvent.coordinate)}
            >
              {places.map((p) => (
                <Marker
                  key={p.id}
                  coordinate={{ latitude: p.lat, longitude: p.lng }}
                  title={p.name}
                  pinColor="#4263EB"
                />
              ))}
              {hasPoint && (
                <Marker
                  coordinate={{ latitude: lat, longitude: lng }}
                  title="Nuevo lugar"
                  draggable
                  onDragEnd={(event) =>
                    selectPoint(event.nativeEvent.coordinate)
                  }
                />
              )}
              {hasPoint && meters >= 50 && meters <= 1000 && (
                <Circle
                  center={{ latitude: lat, longitude: lng }}
                  radius={meters}
                  strokeColor="#D6336C"
                  fillColor="#D6336C22"
                />
              )}
            </MapView>
          ) : (
            <OpenMap
              ref={map}
              style={{ height: 280, marginVertical: 12, borderRadius: 16 }}
              onSelectPoint={selectPoint}
              points={[
                ...places.map((p) => ({
                  ...p,
                  title: p.name,
                  color: '#4263EB',
                  radius: p.radiusMeters,
                })),
                ...(hasPoint
                  ? [
                      {
                        lat,
                        lng,
                        title: 'Nuevo lugar',
                        color: '#A62450',
                        selected: true,
                        radius: meters >= 50 && meters <= 1000 ? meters : 0,
                      },
                    ]
                  : []),
              ]}
            />
          )}
          <Text style={styles.hint}>
            Toca el mapa para elegir un punto o utiliza tu posición actual.
          </Text>
          <TouchableOpacity
            disabled={busy}
            style={styles.secondary}
            onPress={() => run(locate)}
          >
            <Text>Usar mi ubicación actual</Text>
          </TouchableOpacity>
          <TextInput
            accessibilityLabel="Nombre del lugar"
            style={styles.input}
            placeholder="Nombre (Casa, Trabajo…)"
            maxLength={80}
            value={name}
            onChangeText={setName}
          />
          <TextInput
            accessibilityLabel="Latitud"
            style={styles.input}
            placeholder="Latitud"
            value={latitude}
            onChangeText={setLatitude}
            autoCorrect={false}
          />
          <TextInput
            accessibilityLabel="Longitud"
            style={styles.input}
            placeholder="Longitud"
            value={longitude}
            onChangeText={setLongitude}
            autoCorrect={false}
          />
          <TextInput
            accessibilityLabel="Radio en metros"
            style={styles.input}
            placeholder="Radio en metros (50–1000)"
            keyboardType="number-pad"
            value={radius}
            onChangeText={setRadius}
          />
          {error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error.message}
            </Text>
          )}
          <TouchableOpacity
            accessibilityRole="button"
            disabled={busy}
            style={styles.button}
            onPress={() => run(save)}
          >
            <Text style={{ color: 'white' }}>
              {busy ? 'Procesando…' : 'Guardar lugar'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.title}>
            Guardados · {places.length}/{MAX_GEOFENCE_REGIONS}
          </Text>
        </>
      }
      ListEmptyComponent={
        <Text style={styles.hint}>Todavía no tienes lugares guardados.</Text>
      }
      renderItem={({ item }) => (
        <View style={styles.place}>
          <TouchableOpacity
            style={{ flex: 1 }}
            onPress={() => {
              selectPoint({ latitude: item.lat, longitude: item.lng });
              map.current?.animateToRegion({
                latitude: item.lat,
                longitude: item.lng,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              });
            }}
          >
            <Text>{item.name}</Text>
            <Text style={styles.hint}>
              {item.radiusMeters} m · {item.lat.toFixed(4)},{' '}
              {item.lng.toFixed(4)}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={busy} onPress={() => remove(item)}>
            <Text style={styles.error}>Eliminar</Text>
          </TouchableOpacity>
        </View>
      )}
    />
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 16, backgroundColor: '#FFF8FA' },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#8A2846',
    marginVertical: 16,
  },
  hint: { color: '#666', marginVertical: 8 },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
  button: {
    backgroundColor: '#D6336C',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  secondary: {
    padding: 12,
    backgroundColor: '#FCE8EF',
    borderRadius: 12,
    marginVertical: 4,
  },
  place: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#DDD',
  },
  error: { color: '#B42318', marginVertical: 8 },
});
