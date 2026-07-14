import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from '../screens/HomeScreen';
import ChatScreen from '../screens/ChatScreen';
import StoriesScreen from '../screens/StoriesScreen';
import StatusScreen from '../screens/StatusScreen';
import SpecialDatesScreen from '../screens/SpecialDatesScreen';
import GeofenceSetupScreen from '../screens/GeofenceSetupScreen';

const Tab = createBottomTabNavigator();

export default function AppNavigator() {
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
