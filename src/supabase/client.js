import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { environment } from '../config/environment';

/** @type {import('@supabase/supabase-js').SupabaseClient<import('../../supabase/functions/_shared/database.types').Database>} */
export const supabase = createClient(
  environment.supabaseUrl,
  environment.supabasePublishableKey,
  {
    auth: {
      storage: globalThis.localStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

export function startSupabaseAuthAutoRefresh() {
  if (AppState.currentState === 'active') {
    supabase.auth.startAutoRefresh();
  }

  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });

  return () => {
    subscription.remove();
    supabase.auth.stopAutoRefresh();
  };
}

export default supabase;
