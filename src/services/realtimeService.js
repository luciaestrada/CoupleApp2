import { AppState } from 'react-native';
import { supabase } from '../supabase/client';
import { createRealtimeChannel } from '../utils/realtimeChannel';

const observers = new Map();
export function watchQuery({
  channelName,
  table,
  event = '*',
  filter,
  load,
  reduce,
  onData,
  onError,
}) {
  if (!load || !onData || !onError)
    throw new TypeError('watchQuery requiere load, onData y onError.');
  const key = `${channelName}:${table}:${event}:${filter ?? ''}`;
  let entry = observers.get(key);
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
    };
    observers.set(key, entry);
    const publish = (data) => {
      entry.data = data;
      entry.hasData = true;
      entry.listeners.forEach((listener) => listener.onData(data));
    };
    const report = (error) =>
      entry.listeners.forEach((listener) => listener.onError(error));
    const refresh = async () => {
      if (!entry.alive || AppState.currentState !== 'active') return;
      if (entry.loading) {
        entry.again = true;
        return;
      }
      entry.loading = true;
      const revision = entry.revision;
      try {
        const data = await load();
        if (entry.alive && revision === entry.revision) publish(data);
      } catch (error) {
        if (entry.alive && revision === entry.revision) report(error);
      } finally {
        entry.loading = false;
        if (entry.again) {
          entry.again = false;
          void refresh();
        }
      }
    };
    const disconnect = () => {
      entry.revision += 1;
      const channel = entry.channel;
      entry.channel = null;
      if (channel) void supabase.removeChannel(channel).catch(() => {});
    };
    const connect = () => {
      if (entry.channel || !entry.alive || AppState.currentState !== 'active')
        return;
      entry.channel = createRealtimeChannel(supabase, channelName)
        .on(
          'postgres_changes',
          { event, schema: 'public', table, filter },
          (payload) => {
            if (
              reduce &&
              entry.hasData &&
              !entry.loading &&
              payload.eventType !== 'DELETE'
            )
              publish(reduce(entry.data, payload));
            else {
              entry.revision += 1;
              void refresh();
            }
          },
        )
        .subscribe((status, error) => {
          if (!entry.alive || !entry.channel) return;
          if (status === 'SUBSCRIBED') void refresh();
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')
            report(error ?? new Error('Reconectando…'));
        });
      void refresh();
    };
    entry.subscription = AppState.addEventListener('change', (state) =>
      state === 'active' ? connect() : disconnect(),
    );
    entry.dispose = () => {
      entry.alive = false;
      disconnect();
      entry.subscription.remove();
      observers.delete(key);
    };
    entry.connect = connect;
  }
  const listener = { onData, onError };
  entry.listeners.add(listener);
  if (entry.hasData) onData(entry.data);
  entry.connect();
  return () => {
    entry.listeners.delete(listener);
    if (!entry.listeners.size) entry.dispose();
  };
}
