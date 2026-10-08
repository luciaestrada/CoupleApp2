const keyFor = userId => `coupleapp.notificationDiagnostics.${userId}`;
const sources = new Set(['foreground', 'background', 'location']);
export function readNotificationDiagnostics(userId) {
  if (!userId) return {};
  try {
    const state = JSON.parse(localStorage.getItem(keyFor(userId)) ?? '{}');
    return state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  }
  catch { return {}; }
}
export function notificationFailureReason(error) {
  const text = `${error?.code ?? ''} ${error?.name ?? ''} ${error?.message ?? ''}`;
  if (/abort|timeout|timed.out/i.test(text)) return 'timeout';
  if (/not.configured|not.permitted|processing|info.plist|native.module/i.test(text)) return 'configuration';
  if (/401|jwt|refresh.token|session|signed.out/i.test(text)) return 'session';
  if (/42P01|PGRST20[25]/i.test(text)) return 'backend';
  if (/network|fetch|connect/i.test(text)) return 'connection';
  return 'unknown';
}
export function recordNotificationDiagnostic(userId, source, phase, details = {}) {
  if (!userId || (!sources.has(source) && source !== 'registration')) return;
  const state = readNotificationDiagnostics(userId);
  const record = { ...state[source], at: Date.now(), phase };
  if (phase === 'wake') record.lastWake = record.at;
  if (phase === 'success') {
    record.lastSuccess = record.at;
    if (source === 'background' || details.appState === 'background') record.lastBackgroundSuccess = record.at;
  }
  if (details.reason) record.reason = details.reason;
  else if (phase === 'success' || phase === 'registered' || phase === 'disabled') delete record.reason;
  state[source] = record;
  // Store execution metadata only. Notification content, tokens and errors are excluded.
  localStorage.setItem(keyFor(userId), JSON.stringify(state));
}
