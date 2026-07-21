import React, { useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import { useAppContext } from '../contexts/AppContext';
import { requestLocationPermissions } from '../services/distanceService';
import { registerGeofences } from '../services/locationTask';
import { supabase } from '../supabase/client';

function normalizeGeofence(geofence) {
  return {
    id: geofence.id,
    name: geofence.name,
    lat: geofence.lat,
    lng: geofence.lng,
    radiusMeters: geofence.radius_meters,
  };
}

export default function GeofenceSetupScreen() {
  const { userId, couple } = useAppContext();
  const [name, setName] = useState('');
  const [places, setPlaces] = useState([]);

  useEffect(() => {
    if (!couple?.id || !userId) return undefined;
    let active = true;

    async function loadPlaces() {
      const { data, error } = await supabase
        .from('geofences')
        .select('*')
        .eq('couple_id', couple.id)
        .eq('user_id', userId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      const nextPlaces = (data || []).map(normalizeGeofence);
      if (active) setPlaces(nextPlaces);
    }

    loadPlaces().catch(console.error);
    return () => {
      active = false;
    };
  }, [couple?.id, userId]);

  async function handleAddCurrentLocation() {
    if (!name.trim() || !couple?.id || !userId) return;
    try {
      const granted = await requestLocationPermissions();
      if (!granted) {
        Alert.alert('Permiso necesario', 'Activa la ubicación en segundo plano para usar lugares.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const { data, error } = await supabase
        .from('geofences')
        .insert({
          couple_id: couple.id,
          user_id: userId,
          name: name.trim(),
          lat: location.coords.latitude,
          lng: location.coords.longitude,
          radius_meters: 150,
        })
        .select()
        .single();
      if (error) throw error;

      const updatedPlaces = [...places, normalizeGeofence(data)];
      setPlaces(updatedPlaces);
      setName('');
      await registerGeofences(updatedPlaces, couple.id, userId);
    } catch (error) {
      Alert.alert('Error', error?.message || 'No se pudo guardar el lugar');
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>Ve al lugar (casa, trabajo...) y guárdalo con el nombre que quieras.</Text>
      <FlatList
        data={places}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <Text style={styles.item}>📍 {item.name}</Text>}
      />
      <TextInput style={styles.input} placeholder="Nombre del lugar (ej. Casa)" value={name} onChangeText={setName} />
      <TouchableOpacity style={styles.addButton} onPress={handleAddCurrentLocation}>
        <Text style={styles.addButtonText}>Guardar ubicación actual</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  hint: { color: '#666', marginBottom: 10 },
  item: { fontSize: 15, paddingVertical: 6 },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 10, padding: 10, marginTop: 10 },
  addButton: { backgroundColor: '#D6336C', padding: 12, borderRadius: 20, alignItems: 'center', marginTop: 10 },
  addButtonText: { color: 'white', fontWeight: '600' },
});
