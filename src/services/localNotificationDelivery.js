const options = {
  chat: 'chat_enabled', love: 'love_enabled', dates: 'dates_enabled',
  stories: 'stories_enabled', status: 'stories_enabled',
  geofence: 'geofence_enabled', live: 'geofence_enabled',
  exit: 'geofence_enabled',
};
const motionKinds = new Set(['walking', 'cycling', 'driving', 'stationary', 'trip']);

function notificationAllowed(settings, kind) {
  if (!settings?.notifications_enabled) return false;
  if (motionKinds.has(kind)) return settings.event_options?.[kind] === true;
  if (!settings[options[kind]]) return false;
  if (kind === 'geofence' || kind === 'exit')
    return settings.event_options?.[kind === 'geofence' ? 'enter' : 'exit'] === true;
  return true;
}

export function createLocalNotificationDelivery({ userId, storage, isActive, currentUser, permission, currentRoute, schedule, isHandled = () => false, now = Date.now }) {
  const key = `coupleapp.localNotifications.${userId}`;
  let state;
  try { state = JSON.parse(storage.getItem(key)); } catch { /* Reset invalid local state. */ }
  if (!state || !Number.isFinite(state.started) || !Array.isArray(state.seen))
    state = { started: now(), seen: [] };
  const seen = new Set(state.seen);
  const save = () => {
    state.seen = [...seen].slice(-1000);
    storage.setItem(key, JSON.stringify(state));
  };
  save();
  return {
    since: () => new Date(Math.max(state.started, now() - 86400000)).toISOString(),
    async deliver({ rows, settings }) {
      if (!isActive() || await currentUser() !== userId || !(await permission()).granted) return;
      if (!isActive()) return;
      for (const row of [...rows].reverse()) {
        if (!isActive() || await currentUser() !== userId) return;
        if (!isActive()) return;
        if (seen.has(row.id) || row.user_id !== userId) continue;
        const allowed = notificationAllowed(settings, row.kind);
        if (!allowed || row.read_at || row.push_enabled_at_creation === false || isHandled(row) ||
            row.data?.type === 'tracking_control' || Date.parse(row.expires_at) <= now() ||
            Date.parse(row.created_at) < Math.max(state.started, now() - 86400000) ||
            (row.data?.screen === 'Chat' && currentRoute() === 'Chat')) {
          seen.add(row.id); save(); continue;
        }
        await schedule({
          identifier: `coupleapp-inbox-${row.id}`,
          content: {
            title: row.title,
            body: settings.preview_enabled ? row.body : 'Abre CoupleApp para ver el aviso',
            sound: 'default', data: { ...row.data, notificationId: row.id },
          },
          trigger: null,
        });
        seen.add(row.id); save();
      }
    },
  };
}
