// Describe effective capability separately from the saved preference.
// A running collector is not proof of delivery to the other phone.
import type { Settings } from '../../types/domain';
import type { getPermissionSnapshot } from '../../services/permissionService';
export function sharingStatus({ settings, permissions, status, deviceId, paired, now = Date.now() }: {
  settings: Settings; permissions: Awaited<ReturnType<typeof getPermissionSnapshot>> | null;
  status: string; deviceId: string; paired: boolean; now?: number;
}) {
  const options = settings.location_options ?? {};
  const expired = settings.location_mode === 'live' &&
    (!Number.isFinite(Date.parse(settings.live_until ?? '')) || Date.parse(settings.live_until ?? '') <= now);
  let location;
  if (!paired) location = 'Sin pareja vinculada';
  else if (settings.location_mode === 'off' || expired) location = 'Pausada';
  else if (settings.tracking_device_id && settings.tracking_device_id !== deviceId) location = 'Otro dispositivo autorizado';
  else if (!permissions) location = 'Comprobando permisos';
  else if (!permissions.locationServices?.granted) location = 'Ubicación del teléfono apagada';
  else if (!permissions.locationForeground?.granted) location = 'Falta permiso de ubicación';
  else if (status === 'paused') location = 'Pausada en este dispositivo';
  else if (status === 'unavailable') location = 'No disponible';
  else if (status === 'offline') location = 'Pendiente de conexión';
  else if (status === 'sharing') location = 'Última publicación realizada';
  else location = 'Esperando una posición';
  const enabled = ['Última publicación realizada', 'Esperando una posición'].includes(location);
  const dependent = (value: boolean | undefined) => !value ? 'Desactivado' : enabled ? 'Habilitado durante la ubicación' : location;
  return {
    location,
    precision: permissions?.locationForeground?.accuracy === 'approximate'
      ? 'El teléfono permite ubicación aproximada'
      : permissions?.locationForeground?.accuracy === 'precise'
        ? 'El teléfono permite ubicación precisa; cada muestra indica su precisión'
        : 'Precisión del permiso no disponible',
    background: !settings.background_enabled ? 'Solo al usar la app'
      : !permissions ? 'Comprobando permisos'
        : !permissions.locationBackground?.granted ? 'Falta permiso permanente'
          : dependent(true),
    battery: dependent(options.share_battery !== false),
    activity: dependent(options.share_activity !== false),
    history: settings.shared_precision === 'approximate' && settings.history_enabled ? 'Historial de zonas aproximadas' : dependent(settings.history_enabled),
    trips: settings.shared_precision === 'approximate' ? 'Suspendidos con ubicación aproximada' : dependent(options.save_trips !== false),
    live: !settings.auto_live_enabled ? 'Requiere una solicitud aceptada'
      : enabled ? 'Autorizado al abrir tu pareja el mapa' : `Autorizado, pero ${location.toLowerCase()}`,
  };
}
