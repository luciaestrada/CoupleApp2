import React, { useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
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
  getLocationServicesPermission,
  permissionNeedsSettings,
  requestBackgroundLocationPermission,
  requestLocationServicesPermission,
} from '../services/permissionService';
import {
  confirmBackgroundLocationRequest,
  showLocationSettingsAlert,
  showPermissionSettingsAlert,
} from '../utils/permissionUi';

export default function GeofenceSetupScreen() {
  const { userId, couple } = usePairedAppContext();
  const [name, setName] = useState('');
  const [places, setPlaces] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    return watchGeofences(couple.id, userId, {
      onData: setPlaces,
      onError: setError,
    });
  }, [couple.id, userId]);

  async function handleAddCurrentLocation() {
    if (!name.trim()) {
      Alert.alert('Nombre necesario', 'Escribe un nombre para el lugar.');
      return;
    }
    if (places.length >= MAX_GEOFENCE_REGIONS) {
      Alert.alert(
        'Límite alcanzado',
        `Puedes guardar como máximo ${MAX_GEOFENCE_REGIONS} lugares.`
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let locationServices = await getLocationServicesPermission();
      if (!locationServices.granted) {
        locationServices = await requestLocationServicesPermission();
        if (!locationServices.granted) {
          showLocationSettingsAlert(
            'Activa los servicios de ubicación',
            'La ubicación general del dispositivo está apagada y es necesaria para guardar el lugar.'
          );
          return;
        }
      }
      let backgroundPermission = await getBackgroundLocationPermission();
      if (!backgroundPermission.granted) {
        if (permissionNeedsSettings(backgroundPermission)) {
          showPermissionSettingsAlert(
            'Activa la ubicación permanente',
            'Este permiso está bloqueado. En Ajustes, permite la ubicación siempre para usar lugares.'
          );
          return;
        }

        const confirmed = await confirmBackgroundLocationRequest();
        if (!confirmed) return;
        const permissions = await requestBackgroundLocationPermission();
        backgroundPermission = permissions.background;
        if (!permissions.foreground.granted || !backgroundPermission.granted) {
          if (
            permissionNeedsSettings(permissions.foreground) ||
            permissionNeedsSettings(backgroundPermission)
          ) {
            showPermissionSettingsAlert(
              'Activa la ubicación permanente',
              'En Ajustes, permite la ubicación siempre para detectar llegadas con la app cerrada.'
            );
          } else {
            Alert.alert(
              'Permiso necesario',
              'No se guardó el lugar porque falta el acceso permanente a la ubicación.'
            );
          }
          return;
        }
      }

      const location = await Location.getCurrentPositionAsync({});
      const createdPlace = await createGeofence({
        name,
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        radiusMeters: 150,
      });
      const updatedPlaces = [...places, createdPlace];
      setPlaces(updatedPlaces);
      setName('');
      await syncGeofences(updatedPlaces);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(place) {
    Alert.alert('Eliminar lugar', `¿Quieres eliminar “${place.name}”?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          setDeletingId(place.id);
          setError(null);
          try {
            await deleteGeofence(place.id);
            const updatedPlaces = places.filter((savedPlace) => savedPlace.id !== place.id);
            setPlaces(updatedPlaces);
            await syncGeofences(updatedPlaces);
          } catch (nextError) {
            setError(nextError);
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>Ve al lugar (casa, trabajo...) y guárdalo con el nombre que quieras.</Text>
      <Text style={styles.counter}>{places.length}/{MAX_GEOFENCE_REGIONS} lugares</Text>
      <FlatList
        data={places}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text style={styles.itemName}>📍 {item.name}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={deletingId === item.id}
              onPress={() => handleDelete(item)}
              style={styles.deleteButton}
            >
              <Text style={styles.deleteButtonText}>
                {deletingId === item.id ? 'Eliminando…' : 'Eliminar'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      />
      {error && <Text style={styles.error}>{error.message}</Text>}
      <TextInput
        style={styles.input}
        placeholder="Nombre del lugar (ej. Casa)"
        maxLength={80}
        value={name}
        onChangeText={setName}
      />
      <TouchableOpacity disabled={saving} style={styles.addButton} onPress={handleAddCurrentLocation}>
        <Text style={styles.addButtonText}>
          {saving ? 'Guardando…' : 'Guardar ubicación actual'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  hint: { color: '#666', marginBottom: 10 },
  counter: { marginBottom: 8, color: '#888', fontSize: 12 },
  item: { alignItems: 'center', flexDirection: 'row', paddingVertical: 6 },
  itemName: { flex: 1, fontSize: 15, paddingRight: 12 },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 10, padding: 10, marginTop: 10 },
  addButton: { backgroundColor: '#D6336C', padding: 12, borderRadius: 20, alignItems: 'center', marginTop: 10 },
  addButtonText: { color: 'white', fontWeight: '600' },
  deleteButton: { paddingHorizontal: 8, paddingVertical: 6 },
  deleteButtonText: { color: '#B42318', fontSize: 12, fontWeight: '600' },
  error: { color: '#B42318', marginTop: 8 },
});
