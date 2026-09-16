import * as ImageManipulator from 'expo-image-manipulator';
import { fetch } from 'expo/fetch';
import { supabase } from '../supabase/client';
import { watchQuery } from './realtimeService';

const IMAGE_EXTENSIONS = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
});
const IMAGE_CONTENT_TYPES = Object.freeze(
  Object.fromEntries(
    Object.entries(IMAGE_EXTENSIONS).map(([mimeType, extension]) => [
      extension,
      mimeType,
    ]),
  ),
);

function resolveImageType(asset) {
  if (asset.mimeType) {
    const extension = IMAGE_EXTENSIONS[asset.mimeType];
    if (!extension)
      throw new Error(`Formato de imagen no compatible: ${asset.mimeType}.`);
    return { contentType: asset.mimeType, extension };
  }

  const sourceName = asset.fileName ?? asset.uri;
  const extension = sourceName.split('.').pop().split('?')[0].toLowerCase();
  const contentType = IMAGE_CONTENT_TYPES[extension];
  if (!contentType)
    throw new Error('No se pudo determinar un formato de imagen compatible.');
  return { contentType, extension };
}

const signedCache = new Map();
async function withSignedUrls(stories) {
  const now = Date.now();
  for (const [key, value] of signedCache)
    if (value.expires <= now) signedCache.delete(key);
  const missing = stories.filter((story) => !signedCache.has(story.image_path));
  if (missing.length) {
    const { data, error } = await supabase.storage
      .from('stories')
      .createSignedUrls(
        missing.map((story) => story.image_path),
        300,
      );
    if (error) throw error;
    for (const item of data) {
      if (!item.signedUrl) throw new Error('No se pudo abrir una historia.');
      signedCache.set(item.path, {
        url: item.signedUrl,
        expires: now + 240_000,
      });
    }
  }
  return stories.map((story) => ({
    id: story.id,
    authorId: story.author_id,
    imageUrl: signedCache.get(story.image_path)?.url,
    createdAt: story.created_at,
    expiresAt: story.expires_at,
    mediaType: story.media_type ?? 'image',
    caption: story.caption ?? '',
  }));
}

export function watchActiveStories(coupleId, handlers) {
  let expirationTimer;

  function publishActiveStories(stories) {
    clearTimeout(expirationTimer);
    const now = Date.now();
    const activeStories = stories.filter(
      (story) => new Date(story.expiresAt).getTime() > now,
    );
    handlers.onData(activeStories);

    if (activeStories.length > 0) {
      const nextExpiration = Math.min(
        ...activeStories.map((story) => new Date(story.expiresAt).getTime()),
      );
      expirationTimer = setTimeout(
        () => publishActiveStories(activeStories),
        Math.max(0, nextExpiration - Date.now()),
      );
    }
  }

  const stopWatching = watchQuery({
    channelName: `stories-${coupleId}`,
    table: 'stories',
    filter: `couple_id=eq.${coupleId}`,
    async load() {
      const { data, error } = await supabase
        .from('stories')
        .select('*')
        .eq('couple_id', coupleId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return withSignedUrls(data);
    },
    onData: publishActiveStories,
    onError: handlers.onError,
  });

  return () => {
    clearTimeout(expirationTimer);
    stopWatching();
  };
}

export async function uploadStory(coupleId, userId, asset, caption = '') {
  const video = asset.type === 'video';
  if (caption.length > 1000) throw new Error('El texto no puede superar 1000 caracteres.');
  if (video && (!Number.isFinite(asset.duration) || asset.duration > 60000))
    throw new Error('Elige un vídeo de hasta 60 segundos.');
  const mime = asset.mimeType ?? (asset.fileName?.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4');
  if (video && !['video/mp4','video/quicktime'].includes(mime)) throw new Error('Usa un vídeo MP4 o MOV.');
  if (!video) resolveImageType(asset);
  const resized = video ? asset : await ImageManipulator.manipulateAsync(
    asset.uri, asset.width > 1600 ? [{ resize: { width: 1600 } }] : [],
    { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG });
  const contentType = video ? mime : 'image/jpeg';
  const extension = video ? (mime === 'video/quicktime' ? 'mov' : 'mp4') : 'jpg';

  const imagePath = `${coupleId}/${userId}/${Date.now()}.${extension}`;
  const response = await fetch(resized.uri);
  if (!response.ok) throw new Error('No se pudo leer el archivo seleccionado.');
  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > (video ? 50 : 10) * 1024 * 1024)
    throw new Error(video ? 'El vídeo supera el límite de 50 MiB.' : 'La foto supera el límite de 10 MiB.');

  const { error: uploadError } = await supabase.storage
    .from('stories')
    .upload(imagePath, arrayBuffer, { contentType, upsert: false });
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.rpc('create_story_v2', {
    p_image_path: imagePath,
    p_media_type: video ? 'video' : 'image',
    p_caption: caption.trim(),
  });
  if (insertError) {
    const { error: rollbackError } = await supabase.storage
      .from('stories')
      .remove([imagePath]);
    if (rollbackError) {
      throw new Error(
        `${insertError.message}. Tampoco se pudo revertir el archivo: ${rollbackError.message}`,
      );
    }
    throw insertError;
  }
}
