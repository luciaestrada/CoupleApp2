import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { getNotificationPermission } from './permissionService';
import { clearLocalReminders, interruptLocalNotificationSync, localNotificationUser, setLocalNotificationUser, syncLocalNotifications } from './localNotificationSync';
import { syncTrackingConfig } from '../features/location/trackingEngine';
import { notificationFailureReason, recordNotificationDiagnostic } from './notificationDiagnostics';

export const NOTIFICATION_SYNC_TASK = 'COUPLEAPP_NOTIFICATION_SYNC_V1';
export const NOTIFICATION_SYNC_INTERVAL_MINUTES = 3;
let configuration = Promise.resolve();

// Background launches load this definition without mounting any screen.
if (Platform.OS === 'ios' && !TaskManager.isTaskDefined(NOTIFICATION_SYNC_TASK)) {
  TaskManager.defineTask(NOTIFICATION_SYNC_TASK, async ({ error }) => {
    const userId = localNotificationUser();
    recordNotificationDiagnostic(userId, 'background', 'wake');
    if (error) {
      recordNotificationDiagnostic(userId, 'background', 'error', { reason: notificationFailureReason(error) });
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
    let expired = false;
    const expiration = BackgroundTask.addExpirationListener(() => {
      expired = true;
      interruptLocalNotificationSync();
      recordNotificationDiagnostic(userId, 'background', 'expired', { reason: 'timeout' });
    });
    try {
      await syncLocalNotifications({ source: 'background' });
      if (!expired && localNotificationUser()) await syncTrackingConfig().catch(() => {});
      return expired ? BackgroundTask.BackgroundTaskResult.Failed : BackgroundTask.BackgroundTaskResult.Success;
    } catch (error) {
      recordNotificationDiagnostic(userId, 'background', 'error', { reason: notificationFailureReason(error) });
      return BackgroundTask.BackgroundTaskResult.Failed;
    } finally { expiration.remove(); }
  });
}

export function configureBackgroundNotifications(userId) {
  if (Platform.OS !== 'ios') return Promise.resolve();
  const changed = localNotificationUser() !== userId;
  setLocalNotificationUser(userId);
  const cleanup = changed ? clearLocalReminders() : null;
  const configure = async () => {
    if (cleanup) await cleanup;
    if (localNotificationUser() !== userId) return;
    let registered = await TaskManager.isTaskRegisteredAsync(NOTIFICATION_SYNC_TASK);
    const granted = userId && (await getNotificationPermission()).granted;
    if (localNotificationUser() !== userId) return;
    if (!granted) {
      if (registered) await BackgroundTask.unregisterTaskAsync(NOTIFICATION_SYNC_TASK);
      if (!cleanup) await clearLocalReminders();
      recordNotificationDiagnostic(userId, 'registration', 'disabled');
      return;
    }
    if (await BackgroundTask.getStatusAsync() === BackgroundTask.BackgroundTaskStatus.Available) {
      const options = registered ? await TaskManager.getTaskOptionsAsync<BackgroundTask.BackgroundTaskOptions | null>(NOTIFICATION_SYNC_TASK) : null;
      if (localNotificationUser() !== userId) return;
      // Expo skips registration when the name already exists. Replace an old
      // interval once so installed apps adopt the new request without reinstalling.
      if (registered && options?.minimumInterval !== NOTIFICATION_SYNC_INTERVAL_MINUTES) {
        await BackgroundTask.unregisterTaskAsync(NOTIFICATION_SYNC_TASK);
        registered = false;
      }
      if (localNotificationUser() !== userId) return;
      if (!registered) await BackgroundTask.registerTaskAsync(NOTIFICATION_SYNC_TASK, { minimumInterval: NOTIFICATION_SYNC_INTERVAL_MINUTES });
      if (!(await TaskManager.isTaskRegisteredAsync(NOTIFICATION_SYNC_TASK))) throw new Error('Background task not configured');
      const effectiveOptions = await TaskManager.getTaskOptionsAsync<BackgroundTask.BackgroundTaskOptions | null>(NOTIFICATION_SYNC_TASK);
      if (effectiveOptions?.minimumInterval !== NOTIFICATION_SYNC_INTERVAL_MINUTES) throw new Error('Background task interval not configured');
      recordNotificationDiagnostic(userId, 'registration', 'registered');
    } else recordNotificationDiagnostic(userId, 'registration', 'restricted');
  };
  const result = configuration.catch(() => {}).then(configure).catch(error => {
    recordNotificationDiagnostic(userId, 'registration', 'error', { reason: notificationFailureReason(error) });
    throw error;
  });
  configuration = result;
  return result;
}
