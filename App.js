import React, { useEffect } from 'react';
import { Alert, AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { CoupleProvider, useCouple } from './src/context/CoupleContext';
import { TrackingProvider } from './src/context/TrackingContext';
import AppNavigator from './src/navigation/AppNavigator';
import {
  registerForPushNotifications,
  startNotificationResponses,
} from './src/services/notificationService';
import { startGeofenceSync } from './src/services/geofenceService';
import { startAffectionFeedback } from './src/services/affectionFeedbackService';
import {
  registerGeofences,
  flushGeofenceEvents,
} from './src/services/locationTask';

function Bootstrap() {
  useEffect(() => startNotificationResponses(() => {}), []);
  const { user, userProfile, loading: authLoading } = useAuth();
  const { couple, loading: coupleLoading } = useCouple();
  useEffect(() => {
    if (authLoading || coupleLoading || !user?.id || couple?.members.length !== 2) return;
    return startAffectionFeedback(couple.id,user.id);
  },[authLoading,coupleLoading,user?.id,couple?.id,couple?.members.length]);

  useEffect(() => {
    if (!userProfile?.id) return undefined;
    const syncPushToken = () => {
      void registerForPushNotifications().catch(() => {});
    };
    syncPushToken();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        syncPushToken();
        void flushGeofenceEvents().catch(() => {});
      }
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
      onError: (error) =>
        Alert.alert('Lugares no sincronizados', error.message),
    });
  }, [
    authLoading,
    couple?.id,
    couple?.members.length,
    coupleLoading,
    user?.id,
  ]);

  return <AppNavigator />;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <AuthProvider>
        <CoupleProvider>
          <StatusBar style="dark" />
          <TrackingProvider>
            <Bootstrap />
          </TrackingProvider>
        </CoupleProvider>
      </AuthProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
