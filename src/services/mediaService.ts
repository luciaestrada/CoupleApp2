import type { Row } from '../types/domain';
import { supabase } from '../supabase/client';

export async function reserveMediaUpload({ id, purpose, kind, mimeType, byteSize }: { id: string; purpose: string; kind: string; mimeType: string; byteSize: number }) {
  const { data, error } = await supabase.rpc('reserve_media_upload', {
    p_id: id, p_purpose: purpose, p_kind: kind, p_mime: mimeType, p_bytes: byteSize,
  });
  if (error) throw error;
  return data;
}

export async function completeMediaUpload(id: string) {
  const { data, error } = await supabase.rpc('complete_media_upload', { p_id: id });
  if (error) throw error;
  return data;
}

export async function uploadReservedMedia(reservation: Row<'media_assets'>, bytes: ArrayBuffer) {
  if (bytes.byteLength !== reservation.byte_size) throw new Error('El tamaño del archivo ha cambiado.');
  if (reservation.state === 'ready') return completeMediaUpload(reservation.id);
  const { error } = await supabase.storage.from(reservation.bucket_id)
    .upload(reservation.object_path, bytes, { contentType: reservation.mime_type, upsert: false });
  // A retry after a successful upload can see an existing object. The completion
  // RPC still verifies its stored size and MIME type before accepting it.
  if (error && !['409','400'].includes(String(error.statusCode))) throw error;
  return completeMediaUpload(reservation.id);
}

export async function cancelMediaUpload(id: string) {
  const { error } = await supabase.rpc('cancel_media_upload', { p_id: id });
  if (error) throw error;
}

export async function getMediaUrl(asset: Row<'media_assets'>) {
  const { data, error } = await supabase.storage.from(asset.bucket_id).createSignedUrl(asset.object_path, 300);
  if (error) throw error;
  return data.signedUrl;
}
