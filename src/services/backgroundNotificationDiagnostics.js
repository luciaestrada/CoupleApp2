import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import { NOTIFICATION_SYNC_TASK } from './backgroundNotificationService';
import { localNotificationUser } from './localNotificationSync';
import { readNotificationDiagnostics } from './notificationDiagnostics';
import { TRACKING_TASK } from '../features/location/trackingEngine';
import { GEOFENCE_TASK } from './locationTask';

const reasons = {
  timeout: 'La consulta agotó el tiempo disponible.',
  configuration: 'La instalación necesita la configuración nativa de segundo plano. Instala una nueva compilación.',
  session: 'La sesión no pudo renovarse. Vuelve a iniciar sesión.',
  permission: 'El permiso de notificaciones está desactivado en el iPhone.',
  backend: 'El servidor todavía no tiene todas las tablas o funciones necesarias.',
  connection: 'No se pudo conectar con el servidor.',
  unknown: 'La ejecución falló; vuelve a comprobarla con conexión.',
};
const time = at => at ? new Date(at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) : 'Todavía no consta';
export async function getBackgroundNotificationReport() {
  if (Platform.OS !== 'ios') return 'Este diagnóstico corresponde a iOS.';
  const records = readNotificationDiagnostics(localNotificationUser());
  const lines = [];
  try {
    const native = requireOptionalNativeModule('CoupleMotion');
    const state = await native?.getBackgroundExecutionStateAsync?.();
    if (!state) lines.push('Esta instalación no incluye el diagnóstico nativo actualizado.');
    else {
      if (!state.backgroundModes.includes('processing') || !state.schedulerIdentifiers.includes('com.expo.modules.backgroundtask.processing'))
        lines.push('Falta la configuración nativa de tareas de fondo. Instala una nueva compilación.');
      if (state.backgroundRefreshStatus !== 'available') lines.push('La actualización en segundo plano está desactivada o restringida en el iPhone.');
      if (state.lowPowerMode) lines.push('El modo de bajo consumo está activado y puede limitar la ejecución.');
      if (state.simulator) lines.push('Las tareas de fondo necesitan un iPhone físico.');
    }
    const [status, registered] = await Promise.all([
      BackgroundTask.getStatusAsync(), TaskManager.isTaskRegisteredAsync(NOTIFICATION_SYNC_TASK),
    ]);
    lines.push(`Tarea periódica: ${registered ? 'registrada' : 'sin registrar'}.`);
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) lines.push('El servicio de tareas de fondo no está disponible.');
  } catch { lines.push('No se pudo comprobar el servicio nativo. Instala una nueva compilación y comprueba los permisos.'); }
  try {
    const permission = await Location.getBackgroundPermissionsAsync();
    if (!permission.granted) lines.push('Ubicación en segundo plano: sin permiso permanente.');
    else {
      const [tracking, geofencing] = await Promise.all([
        Location.hasStartedLocationUpdatesAsync(TRACKING_TASK), Location.hasStartedGeofencingAsync(GEOFENCE_TASK),
      ]);
      lines.push(`Seguimiento por ubicación: ${tracking ? 'registrado' : 'sin registrar'}. Zonas guardadas: ${geofencing ? 'registradas' : 'sin registrar'}.`);
    }
  } catch { lines.push('No se pudo comprobar el seguimiento por ubicación.'); }
  lines.push(`Última activación de la tarea periódica: ${time(records.background?.lastWake)}.`);
  lines.push(`Última consulta por ubicación con la app en segundo plano: ${time(records.location?.lastBackgroundSuccess)}.`);
  lines.push(`Última consulta completada por tarea periódica: ${time(records.background?.lastSuccess)}.`);
  for (const source of ['registration', 'background', 'location'])
    if (records[source]?.reason) lines.push(reasons[records[source].reason] ?? reasons.unknown);
  lines.push('Estar registrada no garantiza que iOS active la tarea. Las consultas por ubicación necesitan eventos reales de movimiento o zonas. No se garantiza la recepción inmediata.');
  return lines.join('\n\n');
}
