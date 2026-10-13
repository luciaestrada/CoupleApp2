import Storage from 'expo-sqlite/kv-store';
import { advanceWidgetSnapshot, isWidgetSnapshot } from './snapshot';
import type { CoupleWidgetSnapshot } from './types';

const WIDGET_SNAPSHOT_KEY = 'coupleapp.home-widget-snapshot.v1';

export async function storeWidgetSnapshot(snapshot: CoupleWidgetSnapshot) {
  await Storage.setItem(WIDGET_SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export async function readWidgetSnapshot() {
  const serialized = await Storage.getItem(WIDGET_SNAPSHOT_KEY);
  if (serialized === null) return null;
  const value: unknown = JSON.parse(serialized);
  if (!isWidgetSnapshot(value)) {
    throw new Error('Los datos guardados de los widgets no son válidos.');
  }
  return advanceWidgetSnapshot(value, new Date());
}

export async function clearStoredWidgetSnapshot() {
  await Storage.removeItem(WIDGET_SNAPSHOT_KEY);
}
