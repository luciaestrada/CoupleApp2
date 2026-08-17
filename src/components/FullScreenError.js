import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function FullScreenError({ title, error, actionLabel, onAction, onSignOut }) {
  const [actionError, setActionError] = useState(null);
  const [running, setRunning] = useState(false);

  async function run(action) {
    if (running) return;
    setRunning(true);
    setActionError(null);
    try {
      await action();
    } catch (nextError) {
      setActionError(nextError);
    } finally {
      setRunning(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{(actionError ?? error).message}</Text>
      {onAction && (
        <TouchableOpacity
          disabled={running}
          style={[styles.actionButton, running && styles.disabled]}
          onPress={() => void run(onAction)}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
      {onSignOut && (
        <TouchableOpacity
          disabled={running}
          style={[styles.signOutButton, running && styles.disabled]}
          onPress={() => void run(onSignOut)}
        >
          <Text style={styles.signOutText}>Cerrar sesión</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#FFF8FA',
  },
  title: {
    marginBottom: 12,
    color: '#8A2846',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    maxWidth: 420,
    color: '#666',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  actionButton: {
    minWidth: 180,
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#D6336C',
  },
  actionText: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  signOutButton: { marginTop: 20, padding: 8 },
  signOutText: { color: '#777', fontWeight: '600' },
  disabled: { opacity: 0.6 },
});
