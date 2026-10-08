import { AppState } from 'react-native';
import { supabase } from '../supabase/client';
import { createRealtimeChannel } from '../utils/realtimeChannel';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Handlers } from '../types/domain';
import { asError } from '../utils/errors';

interface Change { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }
interface Observer<T> {
  listeners: Set<Handlers<T>>; channel: RealtimeChannel | null; revision: number;
  alive: boolean; hasData: boolean; data: T | undefined; loading: boolean; again: boolean;
  subscription?: { remove(): void }; dispose(): void; connect(): void;
}
export interface WatchOptions<T> extends Handlers<T> {
  channelName: string; table: string; event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE'; filter?: string;
  load(): Promise<T>; reduce?: (data: T, payload: Change) => T;
}

const observers = new Map<string, Observer<unknown>>();
export function watchQuery<T>({
  channelName,
  table,
  event = '*',
  filter,
  load,
  reduce,
  onData,
  onError,
}: WatchOptions<T>) {
  if (!load || !onData || !onError)
    throw new TypeError('watchQuery requiere load, onData y onError.');
  const key = `${channelName}:${table}:${event}:${filter ?? ''}`;
  let entry = observers.get(key) as Observer<T> | undefined;
  if (!entry) {
    entry = {
      listeners: new Set(),
      channel: null,
      revision: 0,
      alive: true,
      hasData: false,
      data: undefined,
      loading: false,
      again: false,
      dispose: () => {}, connect: () => {},
    };
    observers.set(key, entry as Observer<unknown>);
    const currentEntry = entry;
    const publish = (data: T) => {
      currentEntry.data = data;
      currentEntry.hasData = true;
      currentEntry.listeners.forEach((listener) => listener.onData(data));
    };
    const report = (error: unknown) =>
      currentEntry.listeners.forEach((listener) => listener.onError(asError(error)));
    const refresh = async () => {
      if (!currentEntry.alive || AppState.currentState !== 'active') return;
      if (currentEntry.loading) {
        currentEntry.again = true;
        return;
      }
      currentEntry.loading = true;
      const revision = currentEntry.revision;
      try {
        const data = await load();
        if (currentEntry.alive && revision === currentEntry.revision) publish(data);
      } catch (error) {
        if (currentEntry.alive && revision === currentEntry.revision) report(error);
      } finally {
        currentEntry.loading = false;
        if (currentEntry.again) {
          currentEntry.again = false;
          void refresh();
        }
      }
    };
    const disconnect = () => {
      currentEntry.revision += 1;
      const channel = currentEntry.channel;
      currentEntry.channel = null;
      if (channel) void supabase.removeChannel(channel).catch(() => {});
    };
    const connect = () => {
      if (currentEntry.channel || !currentEntry.alive || AppState.currentState !== 'active')
        return;
      const channel = createRealtimeChannel(supabase, channelName);
      currentEntry.channel = channel;
      channel
        .on(
          'postgres_changes',
          { event, schema: 'public', table, filter },
          (payload) => {
            if (!currentEntry.alive || currentEntry.channel !== channel || AppState.currentState !== 'active') return;
            if (
              reduce &&
              currentEntry.hasData &&
              !currentEntry.loading &&
              payload.eventType !== 'DELETE'
            )
              publish(reduce(currentEntry.data as T, payload));
            else {
              currentEntry.revision += 1;
              void refresh();
            }
          },
        )
        .subscribe((status, error) => {
          if (!currentEntry.alive || currentEntry.channel !== channel) return;
          if (status === 'SUBSCRIBED') void refresh();
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')
            report(error ?? new Error('Reconectando…'));
        });
      void refresh();
    };
    currentEntry.subscription = AppState.addEventListener('change', (state) =>
      state === 'active' ? connect() : disconnect(),
    );
    currentEntry.dispose = () => {
      currentEntry.alive = false;
      disconnect();
      currentEntry.subscription?.remove();
      observers.delete(key);
    };
    currentEntry.connect = connect;
  }
  const listener = { onData, onError };
  entry.listeners.add(listener);
  if (entry.hasData) onData(entry.data as T);
  entry.connect();
  return () => {
    entry.listeners.delete(listener);
    if (!entry.listeners.size) entry.dispose();
  };
}
