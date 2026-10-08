// Short foreground GPS windows; motion changes request a correction earlier.
import type { LocationObject } from 'expo-location';
import type { DeviceMotionMeasurement } from 'expo-sensors';
export function createLiveSampler({ watch, onFix, onError, now = Date.now,
  interval = 20000, minInterval = 5000, timeout = 10000 }: {
    watch(callback: (location: LocationObject) => void): Promise<{ remove(): void }>;
    onFix(location: LocationObject): void; onError(error: unknown): void; now?: () => number;
    interval?: number; minInterval?: number; timeout?: number;
  }) {
  let closed = false, pending = false;
  let subscription: { remove(): void } | null = null;
  let nextTimer: ReturnType<typeof setTimeout> | undefined, timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  let lastRequest = -Infinity, attempt = 0;
  const finish = () => {
    pending = false;
    subscription?.remove(); subscription = null;
    clearTimeout(timeoutTimer);
  };
  const schedule = () => {
    clearTimeout(nextTimer);
    if (!closed) nextTimer = setTimeout(request, interval);
  };
  async function request() {
    if (closed || pending || now() - lastRequest < minInterval) return;
    clearTimeout(nextTimer);
    pending = true; lastRequest = now();
    const current = ++attempt;
    timeoutTimer = setTimeout(() => { finish(); schedule(); }, timeout);
    try {
      const sub = await watch(location => {
        if (closed || !pending || current !== attempt) return;
        const age = now() - location.timestamp;
        if (age < 0 || age > 10000 || location.coords.accuracy === null || !Number.isFinite(location.coords.accuracy) || location.coords.accuracy > 100) return;
        finish(); schedule(); onFix(location);
      });
      if (closed || !pending || current !== attempt) sub.remove();
      else subscription = sub;
    } catch (error) {
      if (current !== attempt || closed) return;
      finish(); schedule(); onError(error);
    }
  }
  void request();
  return {
    motion(event: DeviceMotionMeasurement) {
      const a = event.acceleration, r = event.rotationRate;
      if ((a && Math.hypot(a.x, a.y, a.z) > 1.5) ||
        (r && Math.hypot(r.alpha, r.beta, r.gamma) > 25)) void request();
    },
    remove() { closed = true; ++attempt; finish(); clearTimeout(nextTimer); },
  };
}
