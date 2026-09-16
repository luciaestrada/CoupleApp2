import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { syncTrackingConfig } from './trackingEngine';

const TASK = 'COUPLEAPP_TRACKING_WAKE_V1';
// Push contents are only hints. Authorization, device ownership, consent and
// lease expiry are fetched again through an authenticated RPC.
if (!TaskManager.isTaskDefined(TASK)) {
  TaskManager.defineTask(TASK, async ({ error }) => {
    if (!error) await syncTrackingConfig().catch(() => {});
  });
}
void Notifications.registerTaskAsync(TASK).catch(() => {});
