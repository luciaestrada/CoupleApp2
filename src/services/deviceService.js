import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { supabase } from '../supabase/client';

export function getDeviceId() {
  let id = localStorage.getItem('coupleapp.device');
  if (!id) {
    id = Crypto.randomUUID();
    localStorage.setItem('coupleapp.device', id);
  }
  return id;
}

export async function registerDevice(token = null) {
  let secret = localStorage.getItem('coupleapp.installationSecret');
  if (!secret) {
    secret = Crypto.randomUUID();
    localStorage.setItem('coupleapp.installationSecret', secret);
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Vuelve a iniciar sesión.');
  const { error } = await supabase.rpc('register_device', {
    p_device_id: getDeviceId(),
    p_token: token,
    p_platform: Platform.OS,
    p_installation_secret: secret,
    p_expected_user_id: session.user.id,
  });
  if (error) throw error;
}

export async function revokeDevice() {
  const { error } = await supabase.rpc('revoke_device', {
    p_device_id: getDeviceId(),
  });
  if (error) throw error;
}
