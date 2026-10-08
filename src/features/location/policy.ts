import type { TrackingConfig, LocationSample } from '../../types/tracking';
import type { LocationOptions, TrackingMode } from '../../types/domain';
export function effectiveMode(config: Omit<TrackingConfig, 'userId'> | null, now = Date.now(), powerSave = false): TrackingMode {
  if (!config || config.location_mode === 'off') return 'off';
  if (
    config.location_mode === 'live' &&
    (!config.live_until || Date.parse(config.live_until) <= now)
  )
    return 'off';
  if (powerSave || config.powerSave) {
    const policy = config.location_options?.low_battery_mode ?? 'balanced';
    if (policy !== 'live') return policy === 'off' ? 'off' : 'balanced';
  }
  if (config.auto_live_enabled && Date.parse(config.auto_live_until ?? '') > now)
    return 'live';
  return config.location_mode;
}

export function shouldPublish(previous: LocationSample | null, sample: LocationSample | null, mode: TrackingMode, now = Date.now(), options: Partial<LocationOptions> & { trip_active?: boolean } = {}) {
  if (
    mode === 'off' ||
    !sample ||
    !Number.isFinite(sample.lat) ||
    !Number.isFinite(sample.lng) ||
    Math.abs(sample.lat) > 90 ||
    Math.abs(sample.lng) > 180 ||
    sample.accuracy_m === null || !Number.isFinite(sample.accuracy_m) ||
    sample.accuracy_m < 0 ||
    sample.accuracy_m > (sample.approximate ? 10000 : 250)
  )
    return false;
  const time = Date.parse(sample.captured_at);
  if (!Number.isFinite(time) || time > now + 60_000 || time < now - 15 * 60_000)
    return false;
  if (!previous) return true;
  const elapsed = time - Date.parse(previous.captured_at);
  if (elapsed < (mode === 'live' ? 5_000 : 30_000)) return false;
  const radians = Math.PI / 180;
  const a =
    Math.sin(((sample.lat - previous.lat) * radians) / 2) ** 2 +
    Math.cos(previous.lat * radians) *
      Math.cos(sample.lat * radians) *
      Math.sin(((sample.lng - previous.lng) * radians) / 2) ** 2;
  const meters = 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
  return (
    meters >=
      Math.max(
        mode === 'live' ? 5 : (options.normal_distance ?? 30),
        Math.min(sample.accuracy_m, previous.accuracy_m ?? 0),
      ) || elapsed >= (mode === 'live' ? 30_000 : options.trip_active ? Math.min(options.normal_interval ?? 120,120) * 1000 : 5 * 60_000)
  );
}

export function locationAgeLabel(capturedAt: string | null | undefined, now = Date.now()) {
  const age = now - Date.parse(capturedAt ?? '');
  if (!Number.isFinite(age)) return 'Sin ubicación';
  if (age < 0) return 'Hora de captura pendiente de verificar';
  if (age < 30_000) return 'Actualizada ahora';
  if (age < 60_000) return `Hace ${Math.floor(age / 1000)} s`;
  if (age < 3600_000)
    return `Última ubicación hace ${Math.floor(age / 60_000)} min`;
  if (age < 86400_000)
    return `Última ubicación hace ${Math.floor(age / 3600_000)} h`;
  const days = Math.floor(age / 86400_000);
  return `Última ubicación hace ${days} ${days === 1 ? 'día' : 'días'}`;
}
