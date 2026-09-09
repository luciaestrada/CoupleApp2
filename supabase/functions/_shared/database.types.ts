// Generated from the executable installer. Run npm run types:generate.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type Database = { public: { Tables: {
  account_deletion_requests: {
    Row: {
      user_id: string;
      requested_at: string;
    };
    Insert: {
      user_id: string;
      requested_at?: string;
    };
    Update: {
      user_id?: string;
      requested_at?: string;
    };
    Relationships: [];
  };
  couple_members: {
    Row: {
      couple_id: string;
      user_id: string;
      love_streak_count: number;
      last_love_date: string | null;
      joined_at: string;
    };
    Insert: {
      couple_id: string;
      user_id: string;
      love_streak_count?: number;
      last_love_date?: string | null;
      joined_at?: string;
    };
    Update: {
      couple_id?: string;
      user_id?: string;
      love_streak_count?: number;
      last_love_date?: string | null;
      joined_at?: string;
    };
    Relationships: [];
  };
  couples: {
    Row: {
      id: string;
      invite_code: string | null;
      start_date: string;
      created_by: string;
      created_at: string;
    };
    Insert: {
      id?: string;
      invite_code?: string | null;
      start_date: string;
      created_by: string;
      created_at?: string;
    };
    Update: {
      id?: string;
      invite_code?: string | null;
      start_date?: string;
      created_by?: string;
      created_at?: string;
    };
    Relationships: [];
  };
  devices: {
    Row: {
      id: string;
      user_id: string;
      expo_push_token: string | null;
      installation_hash: string;
      platform: string;
      updated_at: string;
    };
    Insert: {
      id: string;
      user_id: string;
      expo_push_token?: string | null;
      installation_hash: string;
      platform: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      user_id?: string;
      expo_push_token?: string | null;
      installation_hash?: string;
      platform?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  geofence_events: {
    Row: {
      id: string;
      couple_id: string;
      user_id: string;
      geofence_id: string;
      event_type: string;
      created_at: string;
    };
    Insert: {
      id?: string;
      couple_id: string;
      user_id: string;
      geofence_id: string;
      event_type: string;
      created_at?: string;
    };
    Update: {
      id?: string;
      couple_id?: string;
      user_id?: string;
      geofence_id?: string;
      event_type?: string;
      created_at?: string;
    };
    Relationships: [];
  };
  geofences: {
    Row: {
      id: string;
      couple_id: string;
      user_id: string;
      name: string;
      lat: number;
      lng: number;
      radius_meters: number;
      created_at: string;
    };
    Insert: {
      id?: string;
      couple_id: string;
      user_id: string;
      name: string;
      lat: number;
      lng: number;
      radius_meters: number;
      created_at?: string;
    };
    Update: {
      id?: string;
      couple_id?: string;
      user_id?: string;
      name?: string;
      lat?: number;
      lng?: number;
      radius_meters?: number;
      created_at?: string;
    };
    Relationships: [];
  };
  live_location_requests: {
    Row: {
      id: string;
      couple_id: string;
      requester_id: string;
      target_id: string;
      status: string;
      created_at: string;
      expires_at: string;
    };
    Insert: {
      id?: string;
      couple_id: string;
      requester_id: string;
      target_id: string;
      status?: string;
      created_at?: string;
      expires_at?: string;
    };
    Update: {
      id?: string;
      couple_id?: string;
      requester_id?: string;
      target_id?: string;
      status?: string;
      created_at?: string;
      expires_at?: string;
    };
    Relationships: [];
  };
  location_history: {
    Row: {
      id: string;
      couple_id: string;
      user_id: string;
      lat: number;
      lng: number;
      recorded_at: string;
    };
    Insert: {
      id?: string;
      couple_id: string;
      user_id: string;
      lat: number;
      lng: number;
      recorded_at?: string;
    };
    Update: {
      id?: string;
      couple_id?: string;
      user_id?: string;
      lat?: number;
      lng?: number;
      recorded_at?: string;
    };
    Relationships: [];
  };
  locations: {
    Row: {
      couple_id: string;
      user_id: string;
      lat: number;
      lng: number;
      updated_at: string;
      captured_at: string;
      accuracy_m: number | null;
      speed_mps: number | null;
      heading: number | null;
      device_id: string | null;
      sample_id: string | null;
      sharing: boolean;
    };
    Insert: {
      couple_id: string;
      user_id: string;
      lat: number;
      lng: number;
      updated_at?: string;
      captured_at: string;
      accuracy_m?: number | null;
      speed_mps?: number | null;
      heading?: number | null;
      device_id?: string | null;
      sample_id?: string | null;
      sharing?: boolean;
    };
    Update: {
      couple_id?: string;
      user_id?: string;
      lat?: number;
      lng?: number;
      updated_at?: string;
      captured_at?: string;
      accuracy_m?: number | null;
      speed_mps?: number | null;
      heading?: number | null;
      device_id?: string | null;
      sample_id?: string | null;
      sharing?: boolean;
    };
    Relationships: [];
  };
  love_events: {
    Row: {
      id: string;
      couple_id: string;
      user_id: string;
      sent_on: string;
      created_at: string;
    };
    Insert: {
      id?: string;
      couple_id: string;
      user_id: string;
      sent_on: string;
      created_at?: string;
    };
    Update: {
      id?: string;
      couple_id?: string;
      user_id?: string;
      sent_on?: string;
      created_at?: string;
    };
    Relationships: [];
  };
  messages: {
    Row: {
      id: string;
      couple_id: string;
      sender_id: string;
      type: string;
      text: string;
      created_at: string;
      client_id: string | null;
    };
    Insert: {
      id?: string;
      couple_id: string;
      sender_id: string;
      type: string;
      text: string;
      created_at?: string;
      client_id?: string | null;
    };
    Update: {
      id?: string;
      couple_id?: string;
      sender_id?: string;
      type?: string;
      text?: string;
      created_at?: string;
      client_id?: string | null;
    };
    Relationships: [];
  };
  notification_deliveries: {
    Row: {
      id: string;
      notification_id: string;
      device_id: string;
      push_token: string;
      status: string;
      attempt_count: number;
      next_attempt_at: string;
      lease_id: string | null;
      claimed_at: string | null;
      ticket_id: string | null;
      receipt_checked_at: string | null;
      last_error: string | null;
      updated_at: string;
    };
    Insert: {
      id?: string;
      notification_id: string;
      device_id: string;
      push_token: string;
      status?: string;
      attempt_count?: number;
      next_attempt_at?: string;
      lease_id?: string | null;
      claimed_at?: string | null;
      ticket_id?: string | null;
      receipt_checked_at?: string | null;
      last_error?: string | null;
      updated_at?: string;
    };
    Update: {
      id?: string;
      notification_id?: string;
      device_id?: string;
      push_token?: string;
      status?: string;
      attempt_count?: number;
      next_attempt_at?: string;
      lease_id?: string | null;
      claimed_at?: string | null;
      ticket_id?: string | null;
      receipt_checked_at?: string | null;
      last_error?: string | null;
      updated_at?: string;
    };
    Relationships: [];
  };
  notifications: {
    Row: {
      id: string;
      user_id: string;
      dedupe_key: string;
      title: string;
      body: string;
      status: string;
      attempt_count: number;
      claimed_at: string | null;
      last_error: string | null;
      created_at: string;
      sent_at: string | null;
      push_enabled_at_creation: boolean;
      kind: string;
      data: Json;
      read_at: string | null;
      expires_at: string;
      couple_id: string | null;
    };
    Insert: {
      id?: string;
      user_id: string;
      dedupe_key: string;
      title: string;
      body: string;
      status?: string;
      attempt_count?: number;
      claimed_at?: string | null;
      last_error?: string | null;
      created_at?: string;
      sent_at?: string | null;
      push_enabled_at_creation?: boolean;
      kind?: string;
      data?: Json;
      read_at?: string | null;
      expires_at?: string;
      couple_id?: string | null;
    };
    Update: {
      id?: string;
      user_id?: string;
      dedupe_key?: string;
      title?: string;
      body?: string;
      status?: string;
      attempt_count?: number;
      claimed_at?: string | null;
      last_error?: string | null;
      created_at?: string;
      sent_at?: string | null;
      push_enabled_at_creation?: boolean;
      kind?: string;
      data?: Json;
      read_at?: string | null;
      expires_at?: string;
      couple_id?: string | null;
    };
    Relationships: [];
  };
  profiles: {
    Row: {
      id: string;
      name: string;
      avatar_url: string | null;
      status_text: string;
      status_emoji: string;
      status_updated_at: string | null;
      created_at: string;
      relationship_updated_at: string;
    };
    Insert: {
      id: string;
      name: string;
      avatar_url?: string | null;
      status_text?: string;
      status_emoji?: string;
      status_updated_at?: string | null;
      created_at?: string;
      relationship_updated_at?: string;
    };
    Update: {
      id?: string;
      name?: string;
      avatar_url?: string | null;
      status_text?: string;
      status_emoji?: string;
      status_updated_at?: string | null;
      created_at?: string;
      relationship_updated_at?: string;
    };
    Relationships: [];
  };
  push_tokens: {
    Row: {
      user_id: string;
      expo_push_token: string;
      updated_at: string;
    };
    Insert: {
      user_id: string;
      expo_push_token: string;
      updated_at?: string;
    };
    Update: {
      user_id?: string;
      expo_push_token?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  special_dates: {
    Row: {
      id: string;
      couple_id: string;
      created_by: string;
      title: string;
      date: string;
      recurring: boolean;
      notify_days_before: number;
      created_at: string;
    };
    Insert: {
      id?: string;
      couple_id: string;
      created_by: string;
      title: string;
      date: string;
      recurring: boolean;
      notify_days_before: number;
      created_at?: string;
    };
    Update: {
      id?: string;
      couple_id?: string;
      created_by?: string;
      title?: string;
      date?: string;
      recurring?: boolean;
      notify_days_before?: number;
      created_at?: string;
    };
    Relationships: [];
  };
  stories: {
    Row: {
      id: string;
      couple_id: string;
      author_id: string;
      image_path: string;
      created_at: string;
      expires_at: string;
    };
    Insert: {
      id?: string;
      couple_id: string;
      author_id: string;
      image_path: string;
      created_at?: string;
      expires_at?: string;
    };
    Update: {
      id?: string;
      couple_id?: string;
      author_id?: string;
      image_path?: string;
      created_at?: string;
      expires_at?: string;
    };
    Relationships: [];
  };
  user_settings: {
    Row: {
      user_id: string;
      location_mode: string;
      live_until: string | null;
      tracking_device_id: string | null;
      history_enabled: boolean;
      background_enabled: boolean;
      notifications_enabled: boolean;
      chat_enabled: boolean;
      love_enabled: boolean;
      geofence_enabled: boolean;
      dates_enabled: boolean;
      stories_enabled: boolean;
      preview_enabled: boolean;
      updated_at: string;
    };
    Insert: {
      user_id: string;
      location_mode?: string;
      live_until?: string | null;
      tracking_device_id?: string | null;
      history_enabled?: boolean;
      background_enabled?: boolean;
      notifications_enabled?: boolean;
      chat_enabled?: boolean;
      love_enabled?: boolean;
      geofence_enabled?: boolean;
      dates_enabled?: boolean;
      stories_enabled?: boolean;
      preview_enabled?: boolean;
      updated_at?: string;
    };
    Update: {
      user_id?: string;
      location_mode?: string;
      live_until?: string | null;
      tracking_device_id?: string | null;
      history_enabled?: boolean;
      background_enabled?: boolean;
      notifications_enabled?: boolean;
      chat_enabled?: boolean;
      love_enabled?: boolean;
      geofence_enabled?: boolean;
      dates_enabled?: boolean;
      stories_enabled?: boolean;
      preview_enabled?: boolean;
      updated_at?: string;
    };
    Relationships: [];
  };
}; Views: Record<never, never>; Functions: {
  cancel_pending_couple: { Args: {  }; Returns: undefined };
  claim_pending_notifications: { Args: { p_limit?: number }; Returns: { id: string; user_id: string; title: string; body: string; attempt_count: number }[] };
  claim_push_deliveries: { Args: { p_limit?: number }; Returns: { id: string; lease_id: string; push_token: string; title: string; body: string; kind: string; data: Json; attempt_count: number; expires_at: string }[] };
  cleanup_location_history: { Args: {  }; Returns: number };
  clear_location_history: { Args: {  }; Returns: undefined };
  create_couple: { Args: { p_start_date: string }; Returns: Json };
  create_geofence: { Args: { p_name: string; p_lat: number; p_lng: number; p_radius_meters: number }; Returns: Json };
  create_special_date: { Args: { p_title: string; p_date: string; p_recurring: boolean; p_notify_days_before: number }; Returns: string };
  create_story: { Args: { p_image_path: string }; Returns: string };
  current_couple_id: { Args: {  }; Returns: string };
  delete_geofence: { Args: { p_geofence_id: string }; Returns: undefined };
  delete_special_date: { Args: { p_date_id: string }; Returns: undefined };
  get_my_couple: { Args: {  }; Returns: Json };
  invoke_maintenance_worker: { Args: {  }; Returns: number };
  invoke_push_worker: { Args: {  }; Returns: number };
  is_complete_couple: { Args: { p_couple_id: string }; Returns: boolean };
  is_couple_member: { Args: { p_couple_id: string }; Returns: boolean };
  join_couple: { Args: { p_invite_code: string }; Returns: Json };
  leave_couple: { Args: {  }; Returns: undefined };
  mark_notification_read: { Args: { p_id: string }; Returns: undefined };
  notification_allowed: { Args: { p_user_id: string; p_kind: string }; Returns: boolean };
  publish_location: { Args: { p_lat: number; p_lng: number }; Returns: undefined };
  publish_location_sample: { Args: { p_sample: Json }; Returns: boolean };
  queue_special_date_notifications: { Args: {  }; Returns: number };
  record_geofence_entry: { Args: { p_geofence_id: string }; Returns: string };
  record_geofence_entry_v2: { Args: { p_geofence_id: string; p_event_id: string; p_recorded_at: string }; Returns: string };
  register_device: { Args: { p_device_id: string; p_token: string; p_platform: string; p_installation_secret: string; p_expected_user_id: string }; Returns: undefined };
  request_account_deletion: { Args: {  }; Returns: undefined };
  request_live_location: { Args: {  }; Returns: string };
  reset_broken_streaks: { Args: {  }; Returns: undefined };
  respond_live_location: { Args: { p_id: string; p_accept: boolean; p_device_id: string }; Returns: undefined };
  revoke_device: { Args: { p_device_id: string }; Returns: undefined };
  save_settings: { Args: { p_settings: Json; p_device_id: string }; Returns: Database['public']['Tables']['user_settings']['Row'] };
  send_love: { Args: { p_couple_id: string }; Returns: Json };
  send_message: { Args: { p_couple_id: string; p_text: string }; Returns: string };
  send_message_v2: { Args: { p_text: string; p_client_id: string; p_expected_user_id: string; p_couple_id: string }; Returns: Database['public']['Tables']['messages']['Row'] };
  set_push_token: { Args: { p_token: string }; Returns: undefined };
  set_status: { Args: { p_text: string; p_emoji: string }; Returns: undefined };
  shares_couple: { Args: { p_other_user_id: string }; Returns: boolean };
  try_uuid: { Args: { p_value: string }; Returns: string };
  update_profile: { Args: { p_name: string; p_avatar_path?: string }; Returns: undefined };
}; Enums: Record<never, never>; CompositeTypes: Record<never, never> } };
