import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, FlatList } from 'react-native';
import * as Location from 'expo-location';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { useCouple } from '../context/CoupleContext';
import { requestLocationPermissions, } from '../services/distanceService';
import { registerGeofences } from '../services/locationTask';

export default function GeofenceSetupScreen() {
  const { userProfile } = useAuth();
  const { couple } = useCouple();
  const [name, setName] = useState('');
  const [places, setPlaces] = useState([]); // { name, lat, lng, radiusMeters }

  async function handleAddCurrentLocation() {
    if (!name.trim()) return;
    const granted = await requestLocationPermissions();
    if (!granted) return;

    const loc = await Location.getCurrentPositionAsync({});
    const newPlace = {
      name,
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      radiusMeters: 150,
    };
    const updated = [...places, newPlace];
    setPlaces(updated);
    setName('');

    await setDoc(doc(db, 'couples', couple.id, 'geofences', userProfile.id), { places: updated });
    await registerGeofences(updated, couple.id, userProfile.id);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>Ve al lugar (casa, trabajo...) y guárdalo con el nombre que quieras.</Text>
      <FlatList
        data={places}
        keyExtractor={(item) => item.name}
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
