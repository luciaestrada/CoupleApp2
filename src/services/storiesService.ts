import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import type { ImagePickerAsset } from 'expo-image-picker';
import { AppState } from 'react-native';
import { fetch } from 'expo/fetch';
import { supabase } from '../supabase/client';
import { watchQuery } from './realtimeService';
import { appStorage, isRecord, readStored, writeStored } from '../persistence/storage';
import { createSignedUrlCache } from '../features/stories/signedUrls';
import { asError } from '../utils/errors';
import type { Handlers, Story } from '../types/domain';

const signedUrls = createSignedUrlCache(async path => {
  const { data, error } = await supabase.storage.from('stories').createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
});
export const getStoryUrl = (path: string, force = false) => signedUrls.get(path, force);

export function watchActiveStories(coupleId: string, handlers: Handlers<Story[]>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let alive = true;
  let rows: Story[] = [];
  let revision = 0;
  const publish = async () => {
    const current = ++revision;
    clearTimeout(timer);
    rows = rows.filter(story => Date.parse(story.expiresAt) > Date.now());
    const signed = await Promise.all(rows.map(async story => {
      try { return { ...story, imageUrl: await getStoryUrl(story.imagePath) }; }
      catch { return { ...story, imageUrl: undefined }; }
    }));
    if (!alive || current !== revision) return;
    handlers.onData(signed);
    if (rows.length && AppState.currentState === 'active') {
      const nextExpiry = Math.min(...rows.map(story => Date.parse(story.expiresAt)));
      timer = setTimeout(() => void publish(), Math.max(100, Math.min(240_000, nextExpiry - Date.now())));
    }
  };
  const stop = watchQuery<Story[]>({
    channelName: `stories-${coupleId}`, table: 'stories', filter: `couple_id=eq.${coupleId}`,
    async load() {
      const { data, error } = await supabase.from('stories').select('*').eq('couple_id', coupleId)
        .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return data.map(story => ({ id: story.id, authorId: story.author_id, imagePath: story.image_path,
        createdAt: story.created_at, expiresAt: story.expires_at, mediaType: story.media_type, caption: story.caption }));
    },
    onData: value => { rows = value; void publish().catch(error => handlers.onError(asError(error))); },
    onError: handlers.onError,
  });
  const app = AppState.addEventListener('change', state => {
    clearTimeout(timer);
    if (state === 'active') void publish();
  });
  return () => { alive = false; revision++; clearTimeout(timer); app.remove(); stop(); };
}

export interface StoryUpload {
  id: string; userId: string; coupleId: string; uri: string; caption: string;
  kind: 'image' | 'video'; mime: string; byteSize: number;
}
const uploadKey = (userId: string, coupleId: string) => `coupleapp.story-upload.${userId}.${coupleId}`;
function isUpload(value: unknown): value is StoryUpload {
  return isRecord(value) && ['id','userId','coupleId','uri','caption','mime'].every(key => typeof value[key] === 'string')
    && (value.kind === 'image' || value.kind === 'video') && typeof value.byteSize === 'number' && value.byteSize > 0;
}
export function pendingStoryUpload(userId: string, coupleId: string): StoryUpload | null {
  const value = readStored<StoryUpload | null>(uploadKey(userId, coupleId), (item): item is StoryUpload | null => item === null || isUpload(item), null);
  return value?.userId === userId && value.coupleId === coupleId ? value : null;
}
function uploadDirectory(userId: string) {
  if (!FileSystem.documentDirectory) throw new Error('No hay almacenamiento local disponible.');
  return `${FileSystem.documentDirectory}story-uploads/${encodeURIComponent(userId)}/`;
}
async function forgetUpload(upload: StoryUpload) {
  if (pendingStoryUpload(upload.userId, upload.coupleId)?.id === upload.id) appStorage.removeItem(uploadKey(upload.userId, upload.coupleId));
  if (upload.uri.startsWith(uploadDirectory(upload.userId))) await FileSystem.deleteAsync(upload.uri, { idempotent: true }).catch(() => {});
}
export async function clearStoryFiles(userId: string) {
  signedUrls.clear();
  await FileSystem.deleteAsync(uploadDirectory(userId), { idempotent: true });
}
async function assertOwner(upload: StoryUpload) {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user.id !== upload.userId || pendingStoryUpload(upload.userId, upload.coupleId)?.id !== upload.id)
    throw new Error('La sesión o la publicación han cambiado.');
}
export async function prepareStoryUpload(coupleId: string, userId: string, asset: ImagePickerAsset, caption: string): Promise<StoryUpload> {
  if (pendingStoryUpload(userId, coupleId)) throw new Error('Reintenta o descarta la historia pendiente antes de crear otra.');
  const video = asset.type === 'video';
  if (caption.length > 1000) throw new Error('El texto no puede superar 1000 caracteres.');
  if (video && (asset.duration == null || !Number.isFinite(asset.duration) || asset.duration > 60000)) throw new Error('Elige un vídeo de hasta 60 segundos.');
  const mime = video ? asset.mimeType ?? (asset.fileName?.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4') : 'image/jpeg';
  if (video && !['video/mp4','video/quicktime'].includes(mime)) throw new Error('Usa un vídeo MP4 o MOV.');
  const resized = video ? asset : await ImageManipulator.manipulateAsync(asset.uri,
    asset.width > 1600 ? [{ resize: { width: 1600 } }] : [], { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG });
  const id = Crypto.randomUUID(), directory = uploadDirectory(userId);
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const uri = `${directory}${id}.${video ? mime === 'video/quicktime' ? 'mov' : 'mp4' : 'jpg'}`;
  await FileSystem.copyAsync({ from: resized.uri, to: uri });
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || info.isDirectory || info.size <= 0 || info.size > (video ? 50 : 10) * 1024 * 1024) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
    throw new Error('El archivo no es válido o supera el tamaño permitido.');
  }
  const upload: StoryUpload = { id, userId, coupleId, uri, caption: caption.trim(), kind: video ? 'video' : 'image', mime, byteSize: info.size };
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user.id !== userId) { await FileSystem.deleteAsync(uri, { idempotent: true }); throw new Error('La sesión ha cambiado.'); }
  writeStored(uploadKey(userId, coupleId), upload);
  return upload;
}
const running = new Map<string, Promise<void>>();
export function resumeStoryUpload(upload: StoryUpload): Promise<void> {
  const existing = running.get(upload.id);
  if (existing) return existing;
  const operation = publishUpload(upload).finally(() => running.delete(upload.id));
  running.set(upload.id, operation);
  return operation;
}
async function publishUpload(upload: StoryUpload) {
  await assertOwner(upload);
  const identity = { p_id: upload.id, p_couple_id: upload.coupleId, p_expected_user_id: upload.userId };
  const current = await supabase.rpc('get_story_upload', identity);
  if (current.error) throw current.error;
  if (current.data?.published_at) { await forgetUpload(upload); return; }
  await assertOwner(upload);
  const reserved = await supabase.rpc('reserve_story_upload', { ...identity, p_kind: upload.kind, p_mime: upload.mime, p_bytes: upload.byteSize });
  if (reserved.error) throw reserved.error;
  let published = await supabase.rpc('publish_story_upload', { ...identity, p_caption: upload.caption });
  if (!published.error) { await forgetUpload(upload); return; }
  if (published.error.code !== '22023') throw published.error;
  await assertOwner(upload);
  const info = await FileSystem.getInfoAsync(upload.uri);
  if (!info.exists || info.isDirectory) throw new Error('Falta el archivo local. Descarta esta subida y selecciona el archivo de nuevo.');
  const response = await fetch(upload.uri);
  if (!response.ok) throw new Error('No se pudo leer el archivo local.');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== upload.byteSize) throw new Error('El archivo local ha cambiado.');
  await assertOwner(upload);
  const { error } = await supabase.storage.from('stories').upload(reserved.data.object_path, bytes, { contentType: upload.mime, upsert: false });
  if (error && !['409','400'].includes(String(error.statusCode))) throw error;
  await assertOwner(upload);
  published = await supabase.rpc('publish_story_upload', { ...identity, p_caption: upload.caption });
  if (published.error) throw published.error;
  await forgetUpload(upload);
}
export async function discardStoryUpload(upload: StoryUpload) {
  await assertOwner(upload);
  const { error } = await supabase.rpc('cancel_story_upload', { p_id: upload.id, p_couple_id: upload.coupleId, p_expected_user_id: upload.userId });
  if (error) throw error;
  await forgetUpload(upload);
}
export async function uploadStory(coupleId: string, userId: string, asset: ImagePickerAsset, caption = '') {
  const upload = pendingStoryUpload(userId, coupleId) ?? await prepareStoryUpload(coupleId, userId, asset, caption);
  await resumeStoryUpload(upload);
}
