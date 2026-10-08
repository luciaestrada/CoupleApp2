import type { LocationOptions, TrackingMode } from './domain';
export interface TrackingConfig {
  userId: string; location_mode: TrackingMode; live_until?: string | null;
  auto_live_until?: string | null; auto_live_enabled?: boolean; background_enabled?: boolean;
  tracking_device_id?: string | null; shared_precision?: string | null; trip_active?: boolean;
  location_options?: Partial<LocationOptions>; powerSave?: boolean; approximate?: boolean;
  acquisitionMode?: TrackingMode;
}
export interface LocationSample {
  lat: number; lng: number; accuracy_m: number | null; captured_at: string;
  approximate?: boolean; sample_id?: string; user_id?: string; device_id?: string;
  speed_mps?: number | null; heading?: number | null; activity?: string;
  activity_confidence?: string; battery_level?: number | null; charging?: boolean | null;
}
export interface TrackingState { status: string; error: string | null; autoLiveUntil?: string | null }
