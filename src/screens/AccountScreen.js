import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { usePairedAppContext } from '../contexts/AppContext';
import { registerForPushNotifications } from '../services/notificationService';
import {
  getPermissionSnapshot,
  permissionNeedsSettings,
  requestBackgroundLocationPermission,
  requestForegroundLocationPermission,
  requestLocationServicesPermission,
} from '../services/permissionService';
import {
  confirmBackgroundLocationRequest,
  showLocationSettingsAlert,
  showPermissionSettingsAlert,
} from '../utils/permissionUi';

const PERMISSION_ROWS = [
  {
    key: 'notifications',
    title: 'Notificaciones',
    description: 'Avisos de llegadas y fechas especiales.',
  },
  {
    key: 'locationServices',
    title: 'Servicios de ubicación',
    description: 'Interruptor general de ubicación del dispositivo.',
  },
  {
    key: 'locationForeground',
    title: 'Ubicación al usar la app',
    description: 'Actualiza la distancia con tu pareja.',
  },
  {
    key: 'locationBackground',
    title: 'Ubicación permanente',
    description: 'Detecta llegadas a lugares con la app cerrada.',
  },
];

function permissionStatus(permission) {
  if (!permission) return { label: 'Comprobando…', color: '#777' };
  if (permission.granted) return { label: 'Activado', color: '#067647' };
  if (permission.canAskAgain) return { label: 'Activar', color: '#B54708' };
  return { label: 'Abrir Ajustes', color: '#B42318' };
}

export default function AccountScreen() {
  const { user, userProfile, couple, signOut } = usePairedAppContext();
  const [signingOut, setSigningOut] = useState(false);
  const [permissions, setPermissions] = useState(null);
  const [permissionAction, setPermissionAction] = useState(null);
  const [permissionError, setPermissionError] = useState(null);

  const loadPermissions = useCallback(async () => {
    try {
      const snapshot = await getPermissionSnapshot();
      setPermissions(snapshot);
      setPermissionError(null);
      return snapshot;
    } catch (error) {
      setPermissionError(error);
      return null;
    }
  }, []);

  useEffect(() => {
    const initialLoad = setTimeout(() => {
      void loadPermissions();
    }, 0);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void loadPermissions();
    });
    return () => {
      clearTimeout(initialLoad);
      subscription.remove();
    };
  }, [loadPermissions]);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } catch (error) {
      Alert.alert('Aviso al cerrar sesión', error.message);
    } finally {
      setSigningOut(false);
    }
  }

  async function handlePermission(key) {
    const current = permissions?.[key];
    if (permissionNeedsSettings(current)) {
      showPermissionSettingsAlert(
        'Permiso bloqueado',
        'El sistema ya no permite volver a preguntarlo desde la app. Puedes activarlo manualmente.'
      );
      return;
    }

    if (key === 'locationBackground') {
      const confirmed = await confirmBackgroundLocationRequest();
      if (!confirmed) return;
    }

    setPermissionAction(key);
    setPermissionError(null);
    try {
      let result;
      let recoverableDenialMessage;
      if (key === 'notifications') {
        result = (await registerForPushNotifications({ requestPermission: true })).permission;
        recoverableDenialMessage = 'Las notificaciones siguen desactivadas. Puedes intentarlo de nuevo.';
      } else if (key === 'locationServices') {
        result = await requestLocationServicesPermission();
        if (!result.granted) {
          showLocationSettingsAlert(
            'Activa los servicios de ubicación',
            'La ubicación general del dispositivo sigue apagada. Actívala en Ajustes.'
          );
        }
      } else if (key === 'locationForeground') {
        result = await requestForegroundLocationPermission();
        recoverableDenialMessage = 'La ubicación sigue desactivada. Puedes intentarlo de nuevo.';
      } else if (key === 'locationBackground') {
        const location = await requestBackgroundLocationPermission();
        if (!location.foreground.granted) {
          result = location.foreground;
          recoverableDenialMessage =
            'Primero debes permitir la ubicación al usar la app. Después podrás activar el acceso permanente.';
        } else {
          result = location.background;
          recoverableDenialMessage =
            'La ubicación permanente sigue desactivada. Puedes intentarlo de nuevo.';
        }
      }

      if (permissionNeedsSettings(result)) {
        showPermissionSettingsAlert(
          'Permiso bloqueado',
          'Puedes activarlo manualmente desde los Ajustes de CoupleApp.'
        );
      } else if (result && !result.granted && recoverableDenialMessage) {
        Alert.alert('Permiso no activado', recoverableDenialMessage);
      }
    } catch (error) {
      setPermissionError(error);
    } finally {
      await loadPermissions();
      setPermissionAction(null);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.name}>{userProfile?.name ?? 'Sin nombre'}</Text>
        <Text style={styles.email}>{user.email}</Text>
        <View style={styles.divider} />
        <Text style={styles.label}>Relación desde</Text>
        <Text style={styles.value}>{couple.startDate}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Permisos</Text>
        <Text style={styles.sectionDescription}>
          Cada permiso se pide solo cuando activas la función correspondiente.
        </Text>
        {permissionError && <Text style={styles.error}>{permissionError.message}</Text>}
        {PERMISSION_ROWS.map((row) => {
          const status = permissionStatus(permissions?.[row.key]);
          const running = permissionAction === row.key;
          return (
            <View key={row.key} style={styles.permissionRow}>
              <View style={styles.permissionCopy}>
                <Text style={styles.permissionTitle}>{row.title}</Text>
                <Text style={styles.permissionDescription}>{row.description}</Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={running || permissions?.[row.key]?.granted}
                onPress={() => handlePermission(row.key)}
                style={styles.permissionAction}
              >
                {running ? (
                  <ActivityIndicator color="#D6336C" size="small" />
                ) : (
                  <Text style={[styles.permissionStatus, { color: status.color }]}>
                    {status.label}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      <TouchableOpacity
        disabled={signingOut}
        style={[styles.signOutButton, signingOut && styles.disabled]}
        onPress={handleSignOut}
      >
        {signingOut ? (
          <ActivityIndicator color="#B42318" />
        ) : (
          <Text style={styles.signOutText}>Cerrar sesión</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#FFF8FA', flexGrow: 1, gap: 16 },
  card: { padding: 20, borderRadius: 16, backgroundColor: '#fff' },
  name: { color: '#8A2846', fontSize: 24, fontWeight: '800' },
  email: { marginTop: 6, color: '#666' },
  divider: { height: 1, marginVertical: 18, backgroundColor: '#EEE' },
  label: { color: '#777', fontSize: 13, fontWeight: '600' },
  value: { marginTop: 4, color: '#333', fontSize: 17, fontWeight: '700' },
  sectionTitle: { color: '#333', fontSize: 18, fontWeight: '800' },
  sectionDescription: { color: '#777', fontSize: 13, marginBottom: 8, marginTop: 4 },
  permissionRow: {
    alignItems: 'center',
    borderTopColor: '#EEE',
    borderTopWidth: 1,
    flexDirection: 'row',
    minHeight: 68,
    paddingVertical: 10,
  },
  permissionCopy: { flex: 1, paddingRight: 10 },
  permissionTitle: { color: '#333', fontSize: 14, fontWeight: '700' },
  permissionDescription: { color: '#777', fontSize: 12, marginTop: 2 },
  permissionAction: { minWidth: 88, paddingVertical: 10, alignItems: 'flex-end' },
  permissionStatus: { fontSize: 12, fontWeight: '800' },
  signOutButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FDA29B',
    borderRadius: 14,
    backgroundColor: '#FFF5F4',
  },
  signOutText: { color: '#B42318', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.6 },
  error: { color: '#B42318', marginVertical: 8 },
});
