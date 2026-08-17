import React, { useEffect } from 'react';
import { Alert, AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { CoupleProvider, useCouple } from './src/context/CoupleContext';
import AppNavigator from './src/navigation/AppNavigator';
import { registerForPushNotifications } from './src/services/notificationService';
import { startGeofenceSync } from './src/services/geofenceService';
import { registerGeofences } from './src/services/locationTask';
import './src/services/locationTask'; // registra la tarea de geofencing

function Bootstrap() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const { couple, loading: coupleLoading } = useCouple();

  useEffect(() => {
    if (!userProfile?.id) return undefined;
    const syncPushToken = () => {
      registerForPushNotifications().catch((error) => {
        Alert.alert('Notificaciones no disponibles', error.message);
      });
    };
    syncPushToken();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncPushToken();
    });
    return () => subscription.remove();
  }, [userProfile?.id]);

  useEffect(() => {
    if (authLoading || coupleLoading) return undefined;
    if (!user?.id || !couple?.id || couple.members.length !== 2) {
      void registerGeofences([]).catch(() => undefined);
      return undefined;
    }

    return startGeofenceSync(couple.id, user.id, {
      onError: (error) => Alert.alert('Lugares no sincronizados', error.message),
    });
  }, [authLoading, couple?.id, couple?.members.length, coupleLoading, user?.id]);

  return <AppNavigator />;
}

export default function App() {
  return (
    <AuthProvider>
      <CoupleProvider>
        <StatusBar style="auto" />
        <Bootstrap />
      </CoupleProvider>
    </AuthProvider>
  );
}
