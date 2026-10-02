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
  TextInput,
  Switch,
  Image,
} from 'react-native';
import { useAppContext } from '../contexts/AppContext';
import { useTracking } from '../context/TrackingContext';
import {
  updateProfile,
  selectAvatar,
  leaveCouple,
  requestAccountDeletion,
  requestPasswordReset,
} from '../services/accountService';
import {
  registerForPushNotifications,
  getPushStatus,
  watchPushStatus,
  testLocalNotification,
} from '../services/notificationService';
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

import { colors } from '../ui/theme';
import SharingSettings from '../ui/SharingSettings';
import AffectionSettings from '../ui/AffectionSettings';
import QuestionSettings from '../ui/QuestionSettings';
import { EventSettings, LocationBehaviorSettings } from '../ui/BehaviorSettings';
function SettingsSection({ title, description, expanded, onPress, children }) {
  return (
    <View style={styles.card}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onPress}
        style={{
          minHeight: 56,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionDescription}>{description}</Text>
        </View>
        <Text style={{ fontSize: 24, color: colors.primary }}>
          {expanded ? '−' : '+'}
        </Text>
      </TouchableOpacity>
      {expanded && <View style={{ paddingTop: 16, gap: 12 }}>{children}</View>}
    </View>
  );
}
const PERMISSION_ROWS = [
  {
    key: 'notifications',
    title: 'Notificaciones',
    description: 'Mensajes, amor, llegadas y fechas especiales.',
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
    description:
      'Permite compartir en segundo plano y detectar llegadas, sujeto a los límites del sistema.',
  },
];

function permissionStatus(permission) {
  if (!permission) return { label: 'Comprobando…', color: '#777' };
  if (permission.granted) return { label: 'Activado', color: '#067647' };
  if (permission.canAskAgain) return { label: 'Activar', color: '#B54708' };
  return { label: 'Abrir Ajustes', color: '#B42318' };
}

export default function SettingsScreen({ navigation }) {
  const { user, userProfile, couple, signOut, refreshCouple, refreshProfile } =
    useAppContext();
  const tracking = useTracking();
  const [section, setSection] = useState(null);
  const [pushStatus, setPushStatus] = useState(getPushStatus);
  useEffect(() => watchPushStatus(setPushStatus), []);
  const [name, setName] = useState(userProfile?.name ?? '');
  const [saving, setSaving] = useState(false);
  async function perform(action) {
    setSaving(true);
    try {
      await action();
    } catch (error) {
      Alert.alert('No se pudo completar', error.message);
    } finally {
      setSaving(false);
    }
  }
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
        'El sistema ya no permite volver a preguntarlo desde la app. Puedes activarlo manualmente.',
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
        result = (
          await registerForPushNotifications({ requestPermission: true })
        ).permission;
        recoverableDenialMessage =
          'Las notificaciones siguen desactivadas. Puedes intentarlo de nuevo.';
      } else if (key === 'locationServices') {
        result = await requestLocationServicesPermission();
        if (!result.granted) {
          showLocationSettingsAlert(
            'Activa los servicios de ubicación',
            'La ubicación general del dispositivo sigue apagada. Actívala en Ajustes.',
          );
        }
      } else if (key === 'locationForeground') {
        result = await requestForegroundLocationPermission();
        recoverableDenialMessage =
          'La ubicación sigue desactivada. Puedes intentarlo de nuevo.';
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
          'Puedes activarlo manualmente desde los Ajustes de CoupleApp.',
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
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.container}
    >
      <SettingsSection title="Lo que comparto" description="Preferencias y estado real de este teléfono"
        expanded={section === 5} onPress={() => setSection(section === 5 ? null : 5)}>
        <SharingSettings tracking={tracking} permissions={permissions} paired={couple?.members.length === 2}
          saving={saving} perform={perform} />
      </SettingsSection>
      <SettingsSection
        title="Perfil"
        description="Nombre, foto y contraseña"
        expanded={section === 0}
        onPress={() => setSection(section === 0 ? null : 0)}
      >
        <Text style={styles.name}>{userProfile?.name ?? 'Sin nombre'}</Text>
        <Text style={styles.email}>{user.email}</Text>
        {!!userProfile?.avatarUrl && (
          <Image
            source={{ uri: userProfile.avatarUrl }}
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              marginVertical: 12,
            }}
          />
        )}
        <TextInput
          accessibilityLabel="Tu nombre"
          value={name}
          onChangeText={setName}
          maxLength={80}
          style={{ borderBottomWidth: 1, padding: 12, marginVertical: 12 }}
        />
        <TouchableOpacity
          disabled={saving}
          onPress={() =>
            perform(async () => {
              await updateProfile(name);
              await refreshProfile();
            })
          }
        >
          <Text style={styles.permissionStatus}>Guardar nombre</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={saving}
          onPress={() =>
            perform(async () => {
              await selectAvatar(name);
              await refreshProfile();
            })
          }
        >
          <Text style={{ marginTop: 16 }}>Cambiar foto</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={saving}
          onPress={() =>
            perform(async () => {
              await requestPasswordReset(user.email);
              Alert.alert(
                'Revisa tu correo',
                'Te hemos enviado un enlace para cambiar la contraseña.',
              );
            })
          }
        >
          <Text style={{ marginTop: 16 }}>Cambiar contraseña por correo</Text>
        </TouchableOpacity>
        <View style={styles.divider} />
        <Text style={styles.label}>Relación desde</Text>
        <Text style={styles.value}>
          {couple?.startDate ?? 'Sin pareja vinculada'}
        </Text>
      </SettingsSection>

      <SettingsSection
        title="Permisos del teléfono"
        description="Controla a qué puede acceder la app"
        expanded={section === 1}
        onPress={() => setSection(section === 1 ? null : 1)}
      >
        <Text style={styles.sectionDescription}>
          Cada permiso se pide solo cuando activas la función correspondiente.
        </Text>
        {permissionError && (
          <Text style={styles.error}>{permissionError.message}</Text>
        )}
        {PERMISSION_ROWS.map((row) => {
          const status = permissionStatus(permissions?.[row.key]);
          const running = permissionAction === row.key;
          return (
            <View key={row.key} style={styles.permissionRow}>
              <View style={styles.permissionCopy}>
                <Text style={styles.permissionTitle}>{row.title}</Text>
                <Text style={styles.permissionDescription}>
                  {row.description}
                </Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={
                  !!permissionAction ||
                  !permissions ||
                  permissions?.[row.key]?.granted
                }
                onPress={() => handlePermission(row.key)}
                style={styles.permissionAction}
              >
                {running ? (
                  <ActivityIndicator color="#D6336C" size="small" />
                ) : (
                  <Text
                    style={[styles.permissionStatus, { color: status.color }]}
                  >
                    {status.label}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          );
        })}
      </SettingsSection>

      <SettingsSection
        title="Notificaciones"
        description="Elige qué avisos quieres recibir"
        expanded={section === 2}
        onPress={() => setSection(section === 2 ? null : 2)}
      >
        <Text style={styles.sectionDescription}>{pushStatus.message}</Text>
        <TouchableOpacity
          disabled={saving}
          onPress={() =>
            perform(async () => {
              try {
                await registerForPushNotifications({
                  requestPermission: true,
                  force: true,
                });
              } finally {
                setPushStatus(getPushStatus());
              }
            })
          }
        >
          <Text style={styles.permissionStatus}>
            Comprobar y activar notificaciones
          </Text>
        </TouchableOpacity>
        <TouchableOpacity disabled={saving} onPress={() => perform(testLocalNotification)}>
          <Text style={styles.permissionStatus}>Enviar aviso local de prueba</Text>
        </TouchableOpacity>
        {[
          ['notifications_enabled', 'Todos los avisos'],
          ['chat_enabled', 'Mensajes'],
          ['love_enabled', 'Gestos de afecto'],
          ['geofence_enabled', 'Llegadas y solicitudes de ubicación'],
          ['dates_enabled', 'Fechas especiales y planes'],
          ['stories_enabled', 'Historias y estados'],
          ['preview_enabled', 'Mostrar contenido en la pantalla bloqueada'],
        ].map(([key, label]) => (
          <View key={key} style={styles.permissionRow}>
            <Text style={{ flex: 1 }}>{label}</Text>
            <Switch
              disabled={saving}
              accessibilityLabel={label}
              value={tracking.settings[key]}
              onValueChange={(value) =>
                perform(() => tracking.update({ [key]: value }))
              }
            />
          </View>
        ))}
        {couple?.members.length === 2 && (
          <TouchableOpacity onPress={() => navigation.navigate('Avisos')}>
            <Text style={{ marginTop: 16 }}>Abrir bandeja de avisos</Text>
          </TouchableOpacity>
        )}
        <EventSettings settings={tracking.settings} saving={saving} save={changes=>perform(()=>tracking.update(changes))} />
      </SettingsSection>
      <SettingsSection title="Gestos de afecto" description="Vibración opcional en este teléfono"
        expanded={section === 'affection'} onPress={()=>setSection(section === 'affection' ? null : 'affection')}>
        <AffectionSettings userId={user.id}/>
      </SettingsSection>
      {couple?.members.length===2 && <SettingsSection title="Preguntas" description="Categorías y consentimiento de ambos"
        expanded={section==='questions'} onPress={()=>setSection(section==='questions'?null:'questions')}>
        <QuestionSettings coupleId={couple.id} userId={user.id}/>
      </SettingsSection>}
      <SettingsSection
        title="Ubicación y privacidad"
        description="Segundo plano e historial compartido"
        expanded={section === 3}
        onPress={() => setSection(section === 3 ? null : 3)}
      >
        <View style={styles.permissionRow}>
          <View style={{ flex: 1 }}>
            <Text>Sesiones automáticas al abrir el mapa</Text>
            <Text style={styles.sectionDescription}>
              Permite que tu pareja solicite actualizaciones frecuentes mientras mira el mapa, hasta 15 minutos. Siempre se respeta tu pausa de ubicación. En segundo plano depende de los permisos y del teléfono.
            </Text>
          </View>
          <Switch accessibilityLabel="Permitir sesiones automáticas de ubicación"
            disabled={saving} value={!!tracking.settings.auto_live_enabled}
            onValueChange={value => perform(() => tracking.update({ auto_live_enabled: value }))} />
        </View>
        <View style={styles.permissionRow}>
          <Text style={styles.permissionCopy}>También en segundo plano</Text>
          <Switch
            disabled={saving}
            accessibilityLabel="Compartir ubicación en segundo plano"
            value={tracking.settings.background_enabled}
            onValueChange={(value) =>
              perform(async () => {
                if (value) {
                  const permissions =
                    await requestBackgroundLocationPermission();
                  if (!permissions.background.granted)
                    throw new Error(
                      'Falta el permiso permanente. Puedes activarlo desde Ajustes.',
                    );
                }
                await tracking.update({ background_enabled: value });
              })
            }
          />
        </View>
        <LocationBehaviorSettings settings={tracking.settings} saving={saving} save={changes=>perform(()=>tracking.update(changes))} />
        <Text style={styles.sectionDescription}>
          La sesión en vivo consume más batería. El sistema puede retrasar o
          detener las actualizaciones; la fecha de cada posición indica su
          antigüedad.
        </Text>
        <View style={styles.permissionRow}>
          <Text style={styles.permissionCopy}>
            Guardar mi historial (30 días)
          </Text>
          <Switch
            disabled={saving}
            accessibilityLabel="Guardar mi historial"
            value={tracking.settings.history_enabled}
            onValueChange={(value) =>
              perform(() => tracking.update({ history_enabled: value }))
            }
          />
        </View>
      </SettingsSection>
      <SettingsSection
        title="Cuenta y relación"
        description="Cerrar sesión, desvincular o eliminar la cuenta"
        expanded={section === 4}
        onPress={() => setSection(section === 4 ? null : 4)}
      >
        {couple && (
          <TouchableOpacity
            disabled={saving}
            onPress={() =>
              Alert.alert(
                'Desvincular pareja',
                'Se borrarán los datos compartidos de ambos y se detendrá la ubicación. Las fotos se retirarán en el siguiente mantenimiento.',
                [
                  { text: 'Cancelar' },
                  {
                    text: 'Desvincular',
                    style: 'destructive',
                    onPress: () =>
                      perform(async () => {
                        await leaveCouple();
                        await refreshCouple();
                      }),
                  },
                ],
              )
            }
          >
            <Text style={[styles.signOutText, { paddingVertical: 14 }]}>
              Desvincular pareja
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          disabled={saving}
          onPress={() =>
            Alert.alert(
              'Eliminar cuenta',
              'Se desvinculará la pareja y se solicitará el borrado definitivo de tu cuenta y archivos. El mantenimiento del servidor completará el borrado.',
              [
                { text: 'Cancelar' },
                {
                  text: 'Eliminar mi cuenta',
                  style: 'destructive',
                  onPress: () =>
                    perform(async () => {
                      await requestAccountDeletion();
                      await signOut();
                    }),
                },
              ],
            )
          }
        >
          <Text style={[styles.signOutText, { paddingVertical: 14 }]}>
            Eliminar mi cuenta
          </Text>
        </TouchableOpacity>
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
      </SettingsSection>
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
  sectionDescription: {
    color: '#777',
    fontSize: 13,
    marginBottom: 8,
    marginTop: 4,
  },
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
  permissionAction: {
    minHeight: 48,
    justifyContent: 'center',
    minWidth: 88,
    paddingVertical: 10,
    alignItems: 'flex-end',
  },
  permissionStatus: { color: colors.primary, fontSize: 14, fontWeight: '800' },
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
