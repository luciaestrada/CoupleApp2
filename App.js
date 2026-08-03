import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { CoupleProvider } from './src/context/CoupleContext';
import AppNavigator from './src/navigation/AppNavigator';
import { registerForPushNotifications } from './src/services/notificationService';
import { supabaseConfigurationError } from './src/supabase/client';
import './src/services/locationTask'; // registra la tarea de geofencing

function Bootstrap() {
  const { userProfile } = useAuth();

  useEffect(() => {
    if (userProfile?.id) registerForPushNotifications(userProfile.id);
  }, [userProfile?.id]);

  return <AppNavigator />;
}

export default function App() {
  if (supabaseConfigurationError) {
    return (
      <View style={styles.configurationErrorContainer}>
        <StatusBar style="dark" />
        <Text style={styles.configurationErrorTitle}>No se pudo iniciar CoupleApp</Text>
        <Text style={styles.configurationErrorText}>
          Esta compilación no tiene la configuración de Supabase. Genera e instala una nueva
          versión de la aplicación.
        </Text>
      </View>
    );
  }

  return (
    <AuthProvider>
      <CoupleProvider>
        <StatusBar style="auto" />
        <Bootstrap />
      </CoupleProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  configurationErrorContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#FFF8FA',
  },
  configurationErrorTitle: {
    marginBottom: 12,
    color: '#8A2846',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  configurationErrorText: {
    color: '#666',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
});
