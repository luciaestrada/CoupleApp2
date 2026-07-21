import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { useCouple } from '../context/CoupleContext';
import AuthScreen from '../screens/AuthScreen';
import PairingScreen from '../screens/PairingScreen';
import HomeScreen from '../screens/HomeScreen';
import ChatScreen from '../screens/ChatScreen';
import StoriesScreen from '../screens/StoriesScreen';
import StatusScreen from '../screens/StatusScreen';
import SpecialDatesScreen from '../screens/SpecialDatesScreen';
import GeofenceSetupScreen from '../screens/GeofenceSetupScreen';

const Tab = createBottomTabNavigator();

export default function AppNavigator() {
  const { user, loading: authLoading } = useAuth();
  const { couple, loading: coupleLoading } = useCouple();

  if (authLoading || (user && coupleLoading)) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#D6336C" />
      </View>
    );
  }

  if (!user) return <AuthScreen />;
  if (!couple) return <PairingScreen />;

  return (
    <NavigationContainer>
      <Tab.Navigator screenOptions={{ headerShown: true }}>
        <Tab.Screen name="Inicio" component={HomeScreen} />
        <Tab.Screen name="Chat" component={ChatScreen} />
        <Tab.Screen name="Historias" component={StoriesScreen} />
        <Tab.Screen name="Estado" component={StatusScreen} />
        <Tab.Screen name="Fechas" component={SpecialDatesScreen} />
        <Tab.Screen name="Lugares" component={GeofenceSetupScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF8FA',
  },
});
