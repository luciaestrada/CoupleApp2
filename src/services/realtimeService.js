import { supabase } from '../supabase/client';
import { createRealtimeChannel } from '../utils/realtimeChannel';

const FAILED_CHANNEL_STATUSES = new Set(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']);

export function watchQuery({ channelName, table, event = '*', filter, load, onData, onError }) {
  if (typeof load !== 'function' || typeof onData !== 'function' || typeof onError !== 'function') {
    throw new TypeError('watchQuery requiere load, onData y onError.');
  }

  let active = true;
  let revision = 0;

  async function refresh() {
    const currentRevision = ++revision;
    try {
      const data = await load();
      if (active && currentRevision === revision) onData(data);
    } catch (error) {
      if (active && currentRevision === revision) onError(error);
    }
  }

  void refresh();

  const channel = createRealtimeChannel(supabase, channelName)
    .on('postgres_changes', { event, schema: 'public', table, filter }, refresh)
    .subscribe((status, error) => {
      if (!active) return;

      // Releer al confirmar cada suscripción cierra la ventana entre la carga inicial
      // y Realtime, y recupera los cambios que hayan ocurrido durante una reconexión.
      if (status === 'SUBSCRIBED') {
        void refresh();
      } else if (FAILED_CHANNEL_STATUSES.has(status)) {
        onError(error instanceof Error ? error : new Error(`Realtime terminó con estado ${status}.`));
      }
    });

  return () => {
    active = false;
    revision += 1;
    void supabase.removeChannel(channel).catch(() => undefined);
  };
}
