import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as TaskManager from 'expo-task-manager';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { CoupleProvider } from './src/context/CoupleContext';
import AppNavigator from './src/navigation/AppNavigator';
import { registerForPushNotifications } from './src/services/notificationService';
import './src/services/locationTask'; // registra la tarea de geofencing

function Bootstrap() {
  const { user, userProfile } = useAuth();

  useEffect(() => {
    if (userProfile?.id) registerForPushNotifications(userProfile.id);
  }, [userProfile?.id]);

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
