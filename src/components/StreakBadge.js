import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export default function StreakBadge({ count, sentToday, onSendLove }) {
  return (
    <TouchableOpacity
      style={[styles.badge, sentToday && styles.badgeSent]}
      onPress={onSendLove}
      disabled={sentToday}
    >
      <Text style={styles.fire}>🔥</Text>
      <Text style={styles.count}>{count}</Text>
      <Text style={styles.label}>{sentToday ? 'Amor enviado hoy' : 'Enviar amor'}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    backgroundColor: '#FFEDEE',
    borderRadius: 16,
    padding: 16,
  },
  badgeSent: { backgroundColor: '#FFD6DA' },
  fire: { fontSize: 28 },
  count: { fontSize: 22, fontWeight: '700', color: '#D6336C' },
  label: { fontSize: 12, color: '#8A2846', marginTop: 4 },
});
