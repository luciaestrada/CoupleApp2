export type TrackingMode = 'off' | 'balanced' | 'live';
export interface LocationSample {
  user_id: string;
  sample_id: string;
  device_id: string;
  captured_at: string;
  lat: number;
  lng: number;
  accuracy_m: number;
  speed_mps: number | null;
  heading: number | null;
}
export interface TrackingConfiguration {
  userId: string;
  location_mode: TrackingMode;
  live_until: string | null;
  tracking_device_id: string | null;
  background_enabled: boolean;
}
