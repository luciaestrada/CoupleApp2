import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { fetch } from 'expo/fetch';
import { supabase } from '../supabase/client';
import { stopTracking } from '../features/location/trackingEngine';
import { registerGeofences } from './locationTask';

export async function updateProfile(name, avatarPath = null) {
  const { error } = await supabase.rpc('update_profile', {
    p_name: name,
    p_avatar_path: avatarPath,
  });
  if (error) throw error;
}
export async function selectAvatar(name) {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  if (result.canceled) return;
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('Vuelve a iniciar sesión.');
  const { data: previous } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', user.id)
    .single();
  const resized = await ImageManipulator.manipulateAsync(
    result.assets[0].uri,
    [{ resize: { width: 512 } }],
    { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG },
  );
  const bytes = await (await fetch(resized.uri)).arrayBuffer();
  const path = `${user.id}/${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, bytes, { contentType: 'image/jpeg' });
  if (error) throw error;
  try {
    await updateProfile(name, path);
  } catch (error) {
    await supabase.storage.from('avatars').remove([path]);
    throw error;
  }
  if (previous?.avatar_url?.startsWith(`${user.id}/`))
    await supabase.storage.from('avatars').remove([previous.avatar_url]);
}
export async function leaveCouple() {
  await stopTracking();
  await registerGeofences([]);
  const { error } = await supabase.rpc('leave_couple');
  if (error) throw error;
}
export async function requestAccountDeletion() {
  await stopTracking();
  await registerGeofences([]);
  const { error } = await supabase.rpc('request_account_deletion');
  if (error) throw error;
}
export async function requestPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: 'coupleapp://auth/recovery',
  });
  if (error) throw error;
}
export async function updatePassword(password) {
  if (password.length < 8)
    throw new Error('Usa una contraseña de al menos 8 caracteres.');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}
