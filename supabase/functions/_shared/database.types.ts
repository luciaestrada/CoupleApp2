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
  activity_states: {
    Row: {
      user_id: string;
      couple_id: string;
      candidate: string | null;
      candidate_since: string | null;
      confirmed: string | null;
      last_notice_at: string | null;
    };
    Insert: {
      user_id: string;
      couple_id: string;
      candidate?: string | null;
      candidate_since?: string | null;
      confirmed?: string | null;
      last_notice_at?: string | null;
    };
    Update: {
      user_id?: string;
      couple_id?: string;
      candidate?: string | null;
      candidate_since?: string | null;
      confirmed?: string | null;
      last_notice_at?: string | null;
    };
    Relationships: [];
  };
  checkin_responses: {
    Row: {
      checkin_id: string;
      user_id: string;
      text: string;
      created_at: string;
    };
    Insert: {
      checkin_id: string;
      user_id: string;
      text: string;
      created_at?: string;
    };
    Update: {
      checkin_id?: string;
      user_id?: string;
      text?: string;
      created_at?: string;
    };
    Relationships: [];
  };
  couple_daily_questions: {
    Row: {
      id: string;
      couple_id: string;
      local_day: string;
      question_id: string | null;
      prompt: string;
      category: string;
      created_at: string;
      updated_at: string;
      closes_at: string;
      revealed_at: string | null;
    };
    Insert: {
      id?: string;
      couple_id: string;
      local_day: string;
      question_id?: string | null;
      prompt: string;
      category: string;
      created_at?: string;
      updated_at?: string;
      closes_at: string;
      revealed_at?: string | null;
    };
    Update: {
      id?: string;
      couple_id?: string;
      local_day?: string;
      question_id?: string | null;
      prompt?: string;
      category?: string;
      created_at?: string;
      updated_at?: string;
      closes_at?: string;
      revealed_at?: string | null;
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
  couple_plans: {
    Row: {
      id: string;
      couple_id: string;
      creator_id: string;
      title: string;
      category: string;
      note: string;
      link: string;
      planned_date: string | null;
      status: string;
      version: number;
      created_at: string;
      updated_at: string;
      completed_at: string | null;
    };
    Insert: {
      id: string;
      couple_id: string;
      creator_id: string;
      title: string;
      category?: string;
      note?: string;
      link?: string;
      planned_date?: string | null;
      status?: string;
      version?: number;
      created_at?: string;
      updated_at?: string;
      completed_at?: string | null;
    };
    Update: {
      id?: string;
      couple_id?: string;
      creator_id?: string;
      title?: string;
      category?: string;
      note?: string;
      link?: string;
      planned_date?: string | null;
      status?: string;
      version?: number;
      created_at?: string;
      updated_at?: string;
      completed_at?: string | null;
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
  daily_checkins: {
    Row: {
      id: string;
      couple_id: string;
      user_id: string;
      local_day: string;
      mood: string;
      energy: number;
      phrase: string;
      created_at: string;
      updated_at: string;
      expires_at: string;
    };
    Insert: {
      id?: string;
      couple_id: string;
      user_id: string;
      local_day: string;
      mood: string;
      energy: number;
      phrase?: string;
      created_at?: string;
      updated_at?: string;
      expires_at: string;
    };
    Update: {
      id?: string;
      couple_id?: string;
      user_id?: string;
      local_day?: string;
      mood?: string;
      energy?: number;
      phrase?: string;
      created_at?: string;
      updated_at?: string;
      expires_at?: string;
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
      approximate: boolean;
      accuracy_m: number | null;
    };
    Insert: {
      id?: string;
      couple_id: string;
      user_id: string;
      lat: number;
      lng: number;
      recorded_at?: string;
      approximate?: boolean;
      accuracy_m?: number | null;
    };
    Update: {
      id?: string;
      couple_id?: string;
      user_id?: string;
      lat?: number;
      lng?: number;
      recorded_at?: string;
      approximate?: boolean;
      accuracy_m?: number | null;
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
      battery_level: number | null;
      charging: boolean | null;
      activity: string | null;
      activity_confidence: string | null;
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
      battery_level?: number | null;
      charging?: boolean | null;
      activity?: string | null;
      activity_confidence?: string | null;
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
      battery_level?: number | null;
      charging?: boolean | null;
      activity?: string | null;
      activity_confidence?: string | null;
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
  map_view_sessions: {
    Row: {
      viewer_id: string;
      device_id: string;
      session_id: string;
      couple_id: string;
      target_id: string;
      started_at: string;
      expires_at: string;
    };
    Insert: {
      viewer_id: string;
      device_id: string;
      session_id: string;
      couple_id: string;
      target_id: string;
      started_at?: string;
      expires_at: string;
    };
    Update: {
      viewer_id?: string;
      device_id?: string;
      session_id?: string;
      couple_id?: string;
      target_id?: string;
      started_at?: string;
      expires_at?: string;
    };
    Relationships: [];
  };
  media_assets: {
    Row: {
      id: string;
      couple_id: string;
      author_id: string;
      purpose: string;
      kind: string;
      bucket_id: string;
      object_path: string;
      mime_type: string;
      byte_size: number;
      state: string;
      created_at: string;
      expires_at: string;
      published_at: string | null;
    };
    Insert: {
      id: string;
      couple_id: string;
      author_id: string;
      purpose: string;
      kind: string;
      bucket_id: string;
      object_path: string;
      mime_type: string;
      byte_size: number;
      state?: string;
      created_at?: string;
      expires_at?: string;
      published_at?: string | null;
    };
    Update: {
      id?: string;
      couple_id?: string;
      author_id?: string;
      purpose?: string;
      kind?: string;
      bucket_id?: string;
      object_path?: string;
      mime_type?: string;
      byte_size?: number;
      state?: string;
      created_at?: string;
      expires_at?: string;
      published_at?: string | null;
    };
    Relationships: [];
  };
  media_deletions: {
    Row: {
      id: number;
      bucket_id: string;
      object_path: string;
      author_id: string;
      created_at: string;
    };
    Insert: {
      id: number;
      bucket_id: string;
      object_path: string;
      author_id: string;
      created_at?: string;
    };
    Update: {
      id?: number;
      bucket_id?: string;
      object_path?: string;
      author_id?: string;
      created_at?: string;
    };
    Relationships: [];
  };
  memory_entries: {
    Row: {
      id: string;
      couple_id: string;
      author_id: string;
      kind: string;
      source_plan_id: string | null;
      title: string;
      body: string;
      event_date: string;
      created_at: string;
      source_checkin_id: string | null;
      source_question_id: string | null;
      featured: boolean;
    };
    Insert: {
      id?: string;
      couple_id: string;
      author_id: string;
      kind: string;
      source_plan_id?: string | null;
      title: string;
      body?: string;
      event_date: string;
      created_at?: string;
      source_checkin_id?: string | null;
      source_question_id?: string | null;
      featured?: boolean;
    };
    Update: {
      id?: string;
      couple_id?: string;
      author_id?: string;
      kind?: string;
      source_plan_id?: string | null;
      title?: string;
      body?: string;
      event_date?: string;
      created_at?: string;
      source_checkin_id?: string | null;
      source_question_id?: string | null;
      featured?: boolean;
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
      metadata: Json;
    };
    Insert: {
      id?: string;
      couple_id: string;
      sender_id: string;
      type: string;
      text: string;
      created_at?: string;
      client_id?: string | null;
      metadata?: Json;
    };
    Update: {
      id?: string;
      couple_id?: string;
      sender_id?: string;
      type?: string;
      text?: string;
      created_at?: string;
      client_id?: string | null;
      metadata?: Json;
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
      status_source: string;
      status_expires_at: string | null;
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
      status_source?: string;
      status_expires_at?: string | null;
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
      status_source?: string;
      status_expires_at?: string | null;
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
  question_answers: {
    Row: {
      question_id: string;
      user_id: string;
      answer: string;
      version: number;
      updated_at: string;
    };
    Insert: {
      question_id: string;
      user_id: string;
      answer: string;
      version?: number;
      updated_at?: string;
    };
    Update: {
      question_id?: string;
      user_id?: string;
      answer?: string;
      version?: number;
      updated_at?: string;
    };
    Relationships: [];
  };
  question_bank: {
    Row: {
      id: string;
      category: string;
      prompt: string;
      couple_id: string | null;
      active: boolean;
    };
    Insert: {
      id?: string;
      category: string;
      prompt: string;
      couple_id?: string | null;
      active?: boolean;
    };
    Update: {
      id?: string;
      category?: string;
      prompt?: string;
      couple_id?: string | null;
      active?: boolean;
    };
    Relationships: [];
  };
  question_preferences: {
    Row: {
      couple_id: string;
      user_id: string;
      categories: (string)[];
      adult_consent_at: string | null;
    };
    Insert: {
      couple_id: string;
      user_id: string;
      categories?: (string)[];
      adult_consent_at?: string | null;
    };
    Update: {
      couple_id?: string;
      user_id?: string;
      categories?: (string)[];
      adult_consent_at?: string | null;
    };
    Relationships: [];
  };
  question_skips: {
    Row: {
      question_id: string;
      user_id: string;
    };
    Insert: {
      question_id: string;
      user_id: string;
    };
    Update: {
      question_id?: string;
      user_id?: string;
    };
    Relationships: [];
  };
  retired_memory_sources: {
    Row: {
      couple_id: string;
      kind: string;
      source_id: string;
    };
    Insert: {
      couple_id: string;
      kind: string;
      source_id: string;
    };
    Update: {
      couple_id?: string;
      kind?: string;
      source_id?: string;
    };
    Relationships: [];
  };
  retired_story_paths: {
    Row: {
      object_path: string;
      retired_at: string;
    };
    Insert: {
      object_path: string;
      retired_at?: string;
    };
    Update: {
      object_path?: string;
      retired_at?: string;
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
      media_type: string;
      caption: string;
      media_asset_id: string | null;
    };
    Insert: {
      id?: string;
      couple_id: string;
      author_id: string;
      image_path: string;
      created_at?: string;
      expires_at?: string;
      media_type?: string;
      caption?: string;
      media_asset_id?: string | null;
    };
    Update: {
      id?: string;
      couple_id?: string;
      author_id?: string;
      image_path?: string;
      created_at?: string;
      expires_at?: string;
      media_type?: string;
      caption?: string;
      media_asset_id?: string | null;
    };
    Relationships: [];
  };
  trips: {
    Row: {
      id: string;
      couple_id: string;
      user_id: string;
      started_at: string;
      last_sample_at: string;
      last_moved_at: string;
      ended_at: string | null;
      end_reason: string | null;
      distance_m: number;
      points: Json;
      activity: string | null;
    };
    Insert: {
      id?: string;
      couple_id: string;
      user_id: string;
      started_at: string;
      last_sample_at: string;
      last_moved_at: string;
      ended_at?: string | null;
      end_reason?: string | null;
      distance_m?: number;
      points?: Json;
      activity?: string | null;
    };
    Update: {
      id?: string;
      couple_id?: string;
      user_id?: string;
      started_at?: string;
      last_sample_at?: string;
      last_moved_at?: string;
      ended_at?: string | null;
      end_reason?: string | null;
      distance_m?: number;
      points?: Json;
      activity?: string | null;
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
      auto_live_enabled: boolean;
      location_options: Json;
      event_options: Json;
      geofence_paused: boolean;
      geofence_resume_after: string;
      shared_precision: string;
      approximate_place_events: boolean;
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
      auto_live_enabled?: boolean;
      location_options?: Json;
      event_options?: Json;
      geofence_paused?: boolean;
      geofence_resume_after?: string;
      shared_precision?: string;
      approximate_place_events?: boolean;
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
      auto_live_enabled?: boolean;
      location_options?: Json;
      event_options?: Json;
      geofence_paused?: boolean;
      geofence_resume_after?: string;
      shared_precision?: string;
      approximate_place_events?: boolean;
    };
    Relationships: [];
  };
}; Views: Record<never, never>; Functions: {
  answer_daily_question: { Args: { p_question_id: string; p_answer: string; p_expected_version: number }; Returns: undefined };
  cancel_media_upload: { Args: { p_id: string }; Returns: undefined };
  cancel_pending_couple: { Args: {  }; Returns: undefined };
  cancel_story_upload: { Args: { p_id: string; p_couple_id: string; p_expected_user_id: string }; Returns: undefined };
  claim_pending_notifications: { Args: { p_limit?: number }; Returns: { id: string; user_id: string; title: string; body: string; attempt_count: number }[] };
  claim_push_deliveries: { Args: { p_limit?: number }; Returns: { id: string; lease_id: string; push_token: string; title: string; body: string; kind: string; data: Json; attempt_count: number; expires_at: string }[] };
  claim_story_cleanup: { Args: { p_limit?: number }; Returns: number };
  cleanup_location_history: { Args: {  }; Returns: number };
  clear_daily_checkin: { Args: { p_checkin_id: string }; Returns: undefined };
  clear_location_history: { Args: {  }; Returns: undefined };
  complete_media_upload: { Args: { p_id: string }; Returns: Database['public']['Tables']['media_assets']['Row'] };
  create_couple: { Args: { p_start_date: string }; Returns: Json };
  create_custom_daily_question: { Args: { p_couple_id: string; p_expected_user_id: string; p_expected_day: string; p_prompt: string }; Returns: Database['public']['Tables']['couple_daily_questions']['Row'] };
  create_geofence: { Args: { p_name: string; p_lat: number; p_lng: number; p_radius_meters: number }; Returns: Json };
  create_special_date: { Args: { p_title: string; p_date: string; p_recurring: boolean; p_notify_days_before: number }; Returns: string };
  create_story: { Args: { p_image_path: string }; Returns: string };
  create_story_v2: { Args: { p_image_path: string; p_media_type: string; p_caption: string }; Returns: string };
  current_couple_id: { Args: {  }; Returns: string };
  delete_geofence: { Args: { p_geofence_id: string }; Returns: undefined };
  delete_special_date: { Args: { p_date_id: string }; Returns: undefined };
  end_map_view: { Args: { p_device_id: string; p_session_id: string }; Returns: undefined };
  finish_trip: { Args: { p_user_id: string; p_reason: string; p_time: string }; Returns: undefined };
  get_daily_question: { Args: { p_category?: string }; Returns: Database['public']['Tables']['couple_daily_questions']['Row'] };
  get_my_couple: { Args: {  }; Returns: Json };
  get_question_preferences: { Args: {  }; Returns: Json };
  get_story_upload: { Args: { p_id: string; p_couple_id: string; p_expected_user_id: string }; Returns: Database['public']['Tables']['media_assets']['Row'] };
  get_tracking_config: { Args: { p_device_id: string }; Returns: Json };
  invoke_maintenance_worker: { Args: {  }; Returns: number };
  invoke_push_worker: { Args: {  }; Returns: number };
  is_complete_couple: { Args: { p_couple_id: string }; Returns: boolean };
  is_couple_member: { Args: { p_couple_id: string }; Returns: boolean };
  join_couple: { Args: { p_invite_code: string }; Returns: Json };
  leave_couple: { Args: {  }; Returns: undefined };
  mark_notification_read: { Args: { p_id: string }; Returns: undefined };
  notification_allowed: { Args: { p_user_id: string; p_kind: string }; Returns: boolean };
  publish_location: { Args: { p_lat: number; p_lng: number }; Returns: undefined };
  publish_location_fix: { Args: { p_sample: Json }; Returns: boolean };
  publish_location_sample: { Args: { p_sample: Json }; Returns: boolean };
  publish_story_upload: { Args: { p_id: string; p_couple_id: string; p_expected_user_id: string; p_caption: string }; Returns: Database['public']['Tables']['stories']['Row'] };
  question_category_enabled: { Args: { p_couple_id: string; p_category: string }; Returns: boolean };
  queue_special_date_notifications: { Args: {  }; Returns: number };
  record_geofence_entry: { Args: { p_geofence_id: string }; Returns: string };
  record_geofence_entry_v2: { Args: { p_geofence_id: string; p_event_id: string; p_recorded_at: string }; Returns: string };
  record_geofence_transition: { Args: { p_geofence_id: string; p_event_id: string; p_recorded_at: string; p_transition: string }; Returns: string };
  register_device: { Args: { p_device_id: string; p_token: string; p_platform: string; p_installation_secret: string; p_expected_user_id: string }; Returns: undefined };
  remember_checkin: { Args: { p_id: string; p_expected_updated_at: string; p_couple_id: string; p_expected_user_id: string }; Returns: Database['public']['Tables']['memory_entries']['Row'] };
  remember_couple_plan: { Args: { p_plan_id: string; p_expected_version: number; p_event_date: string; p_couple_id: string; p_expected_user_id: string }; Returns: Database['public']['Tables']['memory_entries']['Row'] };
  remember_question: { Args: { p_id: string; p_couple_id: string; p_expected_user_id: string }; Returns: Database['public']['Tables']['memory_entries']['Row'] };
  remove_memory: { Args: { p_id: string; p_couple_id: string; p_expected_user_id: string }; Returns: undefined };
  renew_map_view: { Args: { p_device_id: string; p_session_id: string }; Returns: Json };
  request_account_deletion: { Args: {  }; Returns: undefined };
  request_live_location: { Args: {  }; Returns: string };
  reserve_media_upload: { Args: { p_id: string; p_purpose: string; p_kind: string; p_mime: string; p_bytes: number }; Returns: Database['public']['Tables']['media_assets']['Row'] };
  reserve_story_upload: { Args: { p_id: string; p_couple_id: string; p_expected_user_id: string; p_kind: string; p_mime: string; p_bytes: number }; Returns: Database['public']['Tables']['media_assets']['Row'] };
  reset_broken_streaks: { Args: {  }; Returns: undefined };
  respond_daily_checkin: { Args: { p_checkin_id: string; p_text: string }; Returns: undefined };
  respond_live_location: { Args: { p_id: string; p_accept: boolean; p_device_id: string }; Returns: undefined };
  revoke_device: { Args: { p_device_id: string }; Returns: undefined };
  save_behavior_options: { Args: { p_location?: Json; p_events?: Json }; Returns: Database['public']['Tables']['user_settings']['Row'] };
  save_couple_plan: { Args: { p_id: string; p_couple_id: string; p_expected_user_id: string; p_expected_version: number; p_title: string; p_category: string; p_note: string; p_link: string; p_planned_date: string | null; p_status: string }; Returns: Database['public']['Tables']['couple_plans']['Row'] };
  save_daily_checkin: { Args: { p_mood: string; p_energy: number; p_phrase: string }; Returns: Database['public']['Tables']['daily_checkins']['Row'] };
  save_settings: { Args: { p_settings: Json; p_device_id: string }; Returns: Database['public']['Tables']['user_settings']['Row'] };
  send_affection: { Args: { p_couple_id: string; p_client_id: string; p_kind: string }; Returns: Json };
  send_love: { Args: { p_couple_id: string }; Returns: Json };
  send_love_v2: { Args: { p_couple_id: string; p_client_id: string }; Returns: Json };
  send_message: { Args: { p_couple_id: string; p_text: string }; Returns: string };
  send_message_v2: { Args: { p_text: string; p_client_id: string; p_expected_user_id: string; p_couple_id: string }; Returns: Database['public']['Tables']['messages']['Row'] };
  set_approximate_place_events: { Args: { p_enabled: boolean }; Returns: Database['public']['Tables']['user_settings']['Row'] };
  set_auto_live_enabled: { Args: { p_enabled: boolean }; Returns: Database['public']['Tables']['user_settings']['Row'] };
  set_memory_featured: { Args: { p_id: string; p_featured: boolean; p_couple_id: string; p_expected_user_id: string }; Returns: undefined };
  set_place_sharing: { Args: { p_enabled: boolean; p_pause_location?: boolean; p_expected_user_id?: string }; Returns: Database['public']['Tables']['user_settings']['Row'] };
  set_push_token: { Args: { p_token: string }; Returns: undefined };
  set_question_category: { Args: { p_category: string; p_enabled: boolean; p_adult_confirmed: boolean; p_expected_user_id: string; p_couple_id: string }; Returns: Json };
  set_shared_precision: { Args: { p_precision: string }; Returns: Database['public']['Tables']['user_settings']['Row'] };
  set_status: { Args: { p_text: string; p_emoji: string }; Returns: undefined };
  shares_couple: { Args: { p_other_user_id: string }; Returns: boolean };
  skip_daily_question: { Args: { p_question_id: string; p_skip: boolean }; Returns: undefined };
  story_path_available: { Args: { p_path: string }; Returns: boolean };
  try_uuid: { Args: { p_value: string }; Returns: string };
  update_profile: { Args: { p_name: string; p_avatar_path?: string | null }; Returns: undefined };
  uses_approximate_sharing: { Args: { p_user_id: string }; Returns: boolean };
}; Enums: Record<never, never>; CompositeTypes: Record<never, never> } };
