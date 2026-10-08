// Serializes renew/close so a delayed request cannot leave a lease after closing.
export interface MapViewState { status: string; expiresAt?: string; until?: string }
export function startMapViewing({ renew, close, onState, interval = 30000 }: {
  renew(): Promise<MapViewState>; close(): Promise<unknown>; onState(state: MapViewState): void; interval?: number;
}) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    try {
      const result = await renew();
      if (!stopped) onState(result);
      if (result?.status === 'expired') stopped = true;
    } catch {
      if (!stopped) onState({ status: 'offline' });
    } finally {
      if (stopped) await close().catch(() => {});
      else timer = setTimeout(tick, interval);
    }
  };
  void tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
    void close().catch(() => {});
  };
}
