import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { differenceInDays } from 'date-fns';

export default function DaysCounter({ startDate }) {
  if (!startDate) return null;
  const days = differenceInDays(new Date(), startDate);

  return (
    <View style={styles.container}>
      <Text style={styles.number}>{days}</Text>
      <Text style={styles.label}>días juntos</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', padding: 16 },
  number: { fontSize: 34, fontWeight: '800', color: '#8A2846' },
  label: { fontSize: 12, color: '#666' },
});
