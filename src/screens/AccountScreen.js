import React from 'react';
import { ScrollView, Text, Image, View } from 'react-native';
import { useAppContext } from '../contexts/AppContext';
import { MenuRow } from '../ui/components';
import { colors } from '../ui/theme';
export default function AccountScreen({ navigation }) {
  const { user, userProfile, couple } = useAppContext();
  return <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 16, backgroundColor: colors.background, flexGrow: 1 }}>
    <View style={{ padding: 24, backgroundColor: colors.primarySoft, borderRadius: 24, alignItems: 'center', gap: 10 }}>
      {userProfile?.avatarUrl ? <Image source={{ uri: userProfile.avatarUrl }} accessibilityLabel="Tu foto de perfil" style={{ width: 80, height: 80, borderRadius: 40 }} /> : <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' }}><Text style={{ fontSize: 32, color: colors.primary }}>{userProfile?.name?.slice(0, 1).toUpperCase() ?? '♡'}</Text></View>}
      <Text style={{ fontSize: 24, color: colors.text, fontWeight: '700' }}>{userProfile?.name ?? 'Mi cuenta'}</Text>
      <Text style={{ color: colors.muted }}>{user?.email}</Text>
      <Text style={{ color: colors.muted }}>{couple ? 'Juntos desde ' + new Date(couple.startDate + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Tu espacio está listo para compartir'}</Text>
    </View>
    <MenuRow title="Ajustes" description="Tu perfil, privacidad y notificaciones" onPress={() => navigation.navigate('Ajustes')} />
    {couple?.members.length === 2 ? <>
      <MenuRow title="Bandeja de avisos" description="Mensajes, momentos y llegadas" onPress={() => navigation.navigate('Avisos')} />
      <MenuRow title="Mis lugares" description="Gestiona tus avisos de llegada" onPress={() => navigation.navigate('Lugares')} />
    </> : <MenuRow title="Vincular con tu pareja" description="Invita o introduce su código" onPress={() => navigation.navigate('Pareja')} />}
  </ScrollView>;
}
