/** SQLite-backed localStorage is installed once by the Supabase entry point. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export const appStorage: KeyValueStorage = {
  getItem: key => globalThis.localStorage.getItem(key),
  setItem: (key, value) => globalThis.localStorage.setItem(key, value),
  removeItem: key => globalThis.localStorage.removeItem(key),
  key: index => globalThis.localStorage.key(index),
  get length() { return globalThis.localStorage.length; },
};

export function readStored<T>(key: string, validate: (value: unknown) => value is T, fallback: T, storage = appStorage): T {
  try {
    const raw: unknown = JSON.parse(storage.getItem(key) ?? 'null');
    if (isRecord(raw) && raw.version === 1 && validate(raw.value)) return raw.value;
    // Upgrade only after validation; never destroy an unreadable legacy value.
    if (validate(raw)) { writeStored(key, raw, storage); return raw; }
  } catch { /* Corrupt or unavailable local state is not an authenticated value. */ }
  return fallback;
}

export function writeStored<T>(key: string, value: T, storage = appStorage): void {
  storage.setItem(key, JSON.stringify({ version: 1, value }));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const contentPrefixes = [
  'coupleapp.chat.', 'coupleapp.outbox.', 'coupleapp.draft.', 'coupleapp.plan-draft.',
  'coupleapp.story-upload.', 'coupleapp.localNotifications.', 'coupleapp.reminders.handled.',
  'coupleapp.affection.', 'coupleapp.feedback.seen.',
];

/** Installation identity and persisted privacy revocations intentionally survive. */
export function clearAccountContent(userId: string, storage = appStorage): void {
  for (let index = storage.length - 1; index >= 0; index--) {
    const key = storage.key(index);
    if (key && contentPrefixes.some(prefix => key === prefix + userId || key.startsWith(prefix + userId + '.'))) {
      storage.removeItem(key);
    }
  }
}
