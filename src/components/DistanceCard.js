import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function DistanceCard({ distanceKm }) {
  const display =
    distanceKm == null
      ? '—'
      : distanceKm < 1
      ? `${Math.round(distanceKm * 1000)} m`
      : `${distanceKm.toFixed(1)} km`;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Distancia actual</Text>
      <Text style={styles.value}>{display}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', padding: 16 },
  label: { fontSize: 12, color: '#666' },
  value: { fontSize: 26, fontWeight: '700' },
});
