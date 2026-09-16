import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import {
  createBottomTabNavigator,
  BottomTabBar,
} from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { useCouple } from '../context/CoupleContext';
import AuthScreen from '../screens/AuthScreen';
import PairingScreen from '../screens/PairingScreen';
import HomeScreen from '../screens/HomeScreen';
import ChatScreen from '../screens/ChatScreen';
import StoriesScreen from '../screens/StoriesScreen';
import StatusScreen from '../screens/StatusScreen';
import QuestionsScreen from '../screens/QuestionsScreen';
import SpecialDatesScreen from '../screens/SpecialDatesScreen';
import GeofenceSetupScreen from '../screens/GeofenceSetupScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AccountScreen from '../screens/AccountScreen';
import MapScreen from '../screens/MapScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import MemoriesScreen from '../screens/MemoriesScreen';
import RecoveryScreen from '../screens/RecoveryScreen';
import { navigationRef } from './navigationService';
import { drainNotificationResponse } from '../services/notificationService';
import FullScreenError from '../components/FullScreenError';

import { colors } from '../ui/theme';
import TabIcon from '../ui/TabIcon';
const Tab = createBottomTabNavigator();
const primary = ['Inicio', 'Mapa', 'Recuerdos', 'Chat', 'Cuenta', 'Pareja'];
const parent = {
  Historias: 'Recuerdos',
  Fechas: 'Recuerdos',
  Estado: 'Recuerdos',
  Preguntas: 'Inicio',
  Lugares: 'Mapa',
  Avisos: 'Cuenta',
  Ajustes: 'Cuenta',
};
function MainTabBar(props) {
  const current = props.state.routes[props.state.index].name;
  const routes = props.state.routes.filter((route) =>
    primary.includes(route.name),
  );
  const index = Math.max(
    0,
    routes.findIndex((route) => route.name === (parent[current] ?? current)),
  );
  return <BottomTabBar {...props} state={{ ...props.state, routes, index }} />;
}
const screenOptions = ({ navigation, route }) => ({
  unmountOnBlur: true,
  headerStyle: { backgroundColor: colors.background },
  headerShadowVisible: false,
  headerTintColor: colors.text,
  headerTitleStyle: { fontWeight: '700', fontSize: 20 },
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: colors.muted,
  tabBarHideOnKeyboard: true,
  tabBarLabelStyle: { fontSize: 12, fontWeight: '600', paddingBottom: 3 },
  tabBarStyle: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    paddingTop: 6,
  },
  tabBarIcon: ({ color }) => <TabIcon name={route.name} color={color} />,
  headerLeft: () =>
    !primary.includes(route.name) ? (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Volver"
        style={{
          minWidth: 48,
          minHeight: 48,
          justifyContent: 'center',
          paddingLeft: 16,
        }}
        onPress={() =>
          navigation.canGoBack()
            ? navigation.goBack()
            : navigation.navigate(parent[route.name])
        }
      >
        <Text style={{ color: colors.primary, fontSize: 28 }}>‹</Text>
      </TouchableOpacity>
    ) : null,
  headerRight: () =>
    route.name === 'Ajustes' ? null : (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Abrir ajustes"
        onPress={() => navigation.navigate('Ajustes')}
        style={{ padding: 12 }}
      >
        <Text style={{ color: '#8A2846', fontSize: 16 }}>Ajustes</Text>
      </TouchableOpacity>
    ),
});

export default function AppNavigator() {
  const {
    user,
    recovering,
    loading: authLoading,
    error: authError,
    refreshProfile,
    refreshSession,
    signOut,
  } = useAuth();
  const {
    couple,
    loading: coupleLoading,
    error: coupleError,
    refreshCouple,
  } = useCouple();

  if (recovering && user) return <RecoveryScreen />;

  if (authLoading || (user && coupleLoading)) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#D6336C" />
      </View>
    );
  }

  if (authError) {
    return (
      <FullScreenError
        title="No se pudo cargar tu cuenta"
        error={authError}
        actionLabel="Reintentar"
        onAction={user ? refreshProfile : refreshSession}
        onSignOut={user ? signOut : undefined}
      />
    );
  }
  if (!user) return <AuthScreen />;
  if (coupleError && !couple) {
    return (
      <FullScreenError
        title="No se pudo cargar la pareja"
        error={coupleError}
        actionLabel="Reintentar"
        onAction={refreshCouple}
        onSignOut={signOut}
      />
    );
  }
  if (!couple || couple.members.length < 2)
    return (
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={screenOptions}
          backBehavior="history"
          tabBar={(props) => <MainTabBar {...props} />}
        >
          <Tab.Screen name="Pareja" component={PairingScreen} />
          <Tab.Screen name="Cuenta" component={AccountScreen} />
          <Tab.Screen
            name="Ajustes"
            component={SettingsScreen}
            options={{ tabBarItemStyle: { display: 'none' } }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    );

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => {
        void drainNotificationResponse().catch(() => {});
      }}
    >
      <Tab.Navigator
        screenOptions={screenOptions}
        backBehavior="history"
        tabBar={(props) => <MainTabBar {...props} />}
      >
        <Tab.Screen name="Inicio" component={HomeScreen} />
        <Tab.Screen name="Mapa" component={MapScreen} />
        <Tab.Screen name="Recuerdos" component={MemoriesScreen} />
        <Tab.Screen name="Chat" component={ChatScreen} />
        <Tab.Screen name="Preguntas" component={QuestionsScreen} options={{tabBarItemStyle:{display:'none'}}}/>
        <Tab.Screen
          options={{ tabBarItemStyle: { display: 'none' } }}
          name="Historias"
          component={StoriesScreen}
        />
        <Tab.Screen
          options={{ tabBarItemStyle: { display: 'none' } }}
          name="Estado"
          component={StatusScreen}
        />
        <Tab.Screen
          options={{ tabBarItemStyle: { display: 'none' } }}
          name="Fechas"
          component={SpecialDatesScreen}
        />
        <Tab.Screen
          options={{ tabBarItemStyle: { display: 'none' } }}
          name="Lugares"
          component={GeofenceSetupScreen}
        />
        <Tab.Screen
          options={{ tabBarItemStyle: { display: 'none' } }}
          name="Avisos"
          component={NotificationsScreen}
        />
        <Tab.Screen name="Cuenta" component={AccountScreen} />
        <Tab.Screen
          name="Ajustes"
          component={SettingsScreen}
          options={{ tabBarItemStyle: { display: 'none' } }}
        />
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
