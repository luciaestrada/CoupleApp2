import React, { useEffect, useState } from 'react';
import { Text, View, TouchableOpacity, Switch } from 'react-native';
import { sharingStatus } from '../features/location/sharingStatus';
import { getDeviceId } from '../services/deviceService';
import { colors } from './theme';
import { areGeofencesPaused, pauseGeofences, resumeGeofences, watchGeofencePause } from '../services/locationTask';

export default function SharingSettings({ tracking, permissions, paired, saving, perform }) {
  const [placesPaused, setPlacesPaused] = useState(areGeofencesPaused);
  useEffect(() => watchGeofencePause(setPlacesPaused), []);
  const paused = placesPaused || tracking.settings.geofence_paused === true;
  const state = sharingStatus({ settings: tracking.settings, permissions,
    status: tracking.status, deviceId: getDeviceId(), paired });
  return <View style={{ gap: 14 }}>
    <Text style={{ color: colors.muted }}>Estos estados describen este teléfono. La última publicación no garantiza que tu pareja la haya recibido.</Text>
    {[
      ['location', 'Ubicación'], ['background', 'Segundo plano'], ['battery', 'Batería y carga'],
      ['activity', 'Actividad'], ['history', 'Historial'], ['trips', 'Recorridos'], ['live', 'Sesiones automáticas'],
    ].map(([key, label]) => <View key={key} style={{ gap: 4 }}>
      <Text style={{ fontWeight: '600', color: colors.text }}>{label}</Text>
      <Text style={{ color: colors.muted }}>{state[key]}</Text>
    </View>)}
    <Text style={{ color: colors.muted }}>{state.precision}</Text>
    <Text style={{ fontWeight: '600', color: colors.text }}>Precisión que compartes</Text>
    {tracking.settings.shared_precision ? <>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {[['approximate','Aproximada'],['precise','Precisa']].map(([value,label]) =>
          <TouchableOpacity key={value} accessibilityRole="button" disabled={saving}
            accessibilityState={{ selected: tracking.settings.shared_precision === value }}
            onPress={() => perform(() => tracking.update({ shared_precision: value }))}
            style={{ minHeight: 48, padding: 12, borderRadius: 12, backgroundColor: tracking.settings.shared_precision === value ? colors.primary : colors.primarySoft }}>
            <Text style={{ color: tracking.settings.shared_precision === value ? 'white' : colors.primary }}>{label}</Text>
          </TouchableOpacity>)}
      </View>
      <Text style={{ color: colors.muted }}>En aproximada compartes una zona y una estimación de distancia. Si guardas historial, se conservan zonas con su hora, sin dibujar un recorrido exacto. El historial preciso anterior queda oculto a tu pareja mientras uses este modo. Los datos ya recibidos no pueden retirarse de su teléfono.</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ flex: 1, color: colors.text }}>Permitir avisos de lugares concretos incluso en modo aproximado</Text>
        <Switch disabled={saving} accessibilityLabel="Permitir avisos de lugares concretos en modo aproximado"
          value={tracking.settings.approximate_place_events === true}
          onValueChange={value => perform(() => tracking.update({ approximate_place_events: value }))} />
      </View>
      <Text style={{ color: colors.muted }}>Estos avisos revelan el lugar guardado, por ejemplo «Casa», aunque el mapa siga mostrando solo una zona. Requieren permiso permanente y que los avisos de lugares estén reanudados.</Text>
    </> : <Text style={{ color: colors.muted }}>El control de precisión necesita la actualización de privacidad del servidor.</Text>}
    <Text style={{ fontWeight: '600', color: colors.text }}>Avisos de lugares en este teléfono</Text>
    <Text style={{ color: colors.muted }}>{paused ? 'Pausados' : tracking.settings.shared_precision === 'approximate' && !tracking.settings.approximate_place_events ? 'Pendientes de tu autorización para revelar lugares' : !permissions?.locationBackground?.granted ? 'Falta permiso permanente' : 'Habilitados para los lugares guardados'}</Text>
    <TouchableOpacity accessibilityRole="button" disabled={saving}
      onPress={() => perform(async () => {
        if (!paused) {
          await pauseGeofences();
          await tracking.update({ geofence_paused: true });
        }
        else {
          if (!permissions?.locationBackground?.granted) throw new Error('Activa el permiso permanente en Permisos del teléfono antes de reanudar.');
          await tracking.update({ geofence_paused: false });
          resumeGeofences();
        }
      })} style={{ minHeight: 48, justifyContent: 'center' }}>
      <Text style={{ color: colors.primary }}>{paused ? 'Reanudar avisos de lugares' : 'Pausar avisos de lugares'}</Text>
    </TouchableOpacity>
    {!!tracking.error && <Text style={{ color: colors.muted }}>{tracking.error}</Text>}
    <TouchableOpacity accessibilityRole="button" disabled={saving}
      onPress={() => perform(() => tracking.update({ location_mode: 'off' }))}
      style={{ minHeight: 48, justifyContent: 'center', padding: 12, backgroundColor: colors.primarySoft, borderRadius: 12 }}>
      <Text style={{ color: colors.primary, fontWeight: '600' }}>Pausar mi ubicación</Text>
    </TouchableOpacity>
    <Text style={{ color: colors.muted }}>La pausa detiene la publicación de posiciones y no afecta a las rachas. Los avisos de entrada y salida de lugares se gestionan por separado y pueden continuar.</Text>
    <TouchableOpacity accessibilityRole="button" disabled={saving}
      onPress={() => perform(async () => {
        const results = await Promise.allSettled([pauseGeofences(), tracking.update({ location_mode: 'off', geofence_paused: true })]);
        const failure = results.find(result => result.status === 'rejected');
        if (failure) throw failure.reason;
      })} style={{ minHeight: 48, justifyContent: 'center', padding: 12, backgroundColor: colors.primarySoft, borderRadius: 12 }}>
      <Text style={{ color: colors.primary, fontWeight: '600' }}>Pausar toda mi información de ubicación</Text>
    </TouchableOpacity>
    <Text style={{ color: colors.muted }}>La pausa es inmediata en este teléfono. Al guardar en el servidor se bloquean nuevos eventos de lugares de tus dispositivos. Si falla la conexión, se reintenta mientras usas la app y al volver a abrirla. Un aviso ya enviado no puede retirarse.</Text>
    <Text style={{ color: colors.muted }}>Puedes cambiar batería, actividad, historial y recorridos en Ubicación. El reconocimiento de actividad requiere además el permiso de sensores.</Text>
  </View>;
}
