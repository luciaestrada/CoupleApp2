import type { Database, Json } from '../../supabase/functions/_shared/database.types';
import type { AppError } from '../utils/errors';
export type { Json };
export type Row<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export interface Handlers<T> { onData: (data: T) => void; onError: (error: AppError) => void }
export interface Streak { userId: string; count: number; lastConfirmedDay: string | null }
export interface Couple { id: string; inviteCode: string | null; startDate: string; members: string[]; streaks: Streak[] }
export interface Profile {
  id: string; name: string; avatarUrl: string | null;
  status: { text: string | null; emoji: string | null; updatedAt: string | null; expiresAt: string | null };
}
export interface Message {
  id: string; senderId: string; text: string; loveTap: boolean; type: string;
  metadata: { [key: string]: Json | undefined }; createdAt: string;
}
export type TrackingMode = 'off' | 'balanced' | 'live';
export interface LocationOptions {
  normal_distance: number; normal_interval: number; live_interval: number; battery_threshold: number;
  low_battery_mode: TrackingMode; share_battery: boolean; share_activity: boolean; save_trips: boolean; motion_assist: boolean;
}
export interface EventOptions { enter: boolean; exit: boolean; walking: boolean; cycling: boolean; driving: boolean; stationary: boolean; trip: boolean }
export type Settings = Omit<Partial<Row<'user_settings'>>, 'location_options' | 'event_options' | 'location_mode'> & {
  location_mode: TrackingMode; location_options: LocationOptions; event_options: EventOptions;
};
export type SettingsChange = Omit<Partial<Settings>, 'location_options' | 'event_options'> & {
  location_options?: Partial<LocationOptions>; event_options?: Partial<EventOptions>;
};
export interface SharedLocation {
  lat: number; lng: number; updatedAt: string; receivedAt: string; accuracy: number | null;
  speed: number | null; heading: number | null; batteryLevel: number | null;
  charging: boolean | null; activity: string | null; activityConfidence: string | null;
  estimated?: boolean;
}
export interface Geofence { id: string; name: string; lat: number; lng: number; radiusMeters: number }
export interface Story {
  id: string; authorId: string; imagePath: string; imageUrl?: string;
  createdAt: string; expiresAt: string; mediaType: string; caption: string;
}
export type Plan = Row<'couple_plans'> & { memory?: Pick<Row<'memory_entries'>, 'id' | 'title' | 'body' | 'event_date'> | null };
export type PlanDraft = Pick<Row<'couple_plans'>,'id' | 'version' | 'title' | 'category' | 'note' | 'link' | 'status'> & { planned_date: string | null };
