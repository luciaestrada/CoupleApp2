import { fetch } from 'expo/fetch';
import { supabase } from '../supabase/client';

function getContentType(uri) {
  const extension = uri.split('.').pop()?.split('?')[0]?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'heic' || extension === 'heif') return `image/${extension}`;
  return 'image/jpeg';
}

async function withSignedUrls(stories) {
  return Promise.all(
    stories.map(async (story) => {
      const { data, error } = await supabase.storage
        .from('stories')
        .createSignedUrl(story.image_path, 60 * 60);
      if (error) throw error;
      return {
        id: story.id,
        authorId: story.author_id,
        imageUrl: data.signedUrl,
        createdAt: story.created_at,
        expiresAt: story.expires_at,
      };
    })
  );
}

export function watchActiveStories(coupleId, onChange) {
  let active = true;

  async function loadStories() {
    const { data, error } = await supabase
      .from('stories')
      .select('*')
      .eq('couple_id', coupleId)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });
    if (error) throw error;
    const stories = await withSignedUrls(data || []);
    if (active) onChange(stories);
  }

  loadStories().catch(console.error);
  const channel = supabase
    .channel(`stories-${coupleId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'stories', filter: `couple_id=eq.${coupleId}` },
      () => loadStories().catch(console.error)
    )
    .subscribe();

  return () => {
    active = false;
    supabase.removeChannel(channel);
  };
}

export async function uploadStory(coupleId, userId, uri) {
  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();
  const extension = uri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
  const imagePath = `${coupleId}/${userId}/${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage.from('stories').upload(
    imagePath,
    arrayBuffer,
    { contentType: getContentType(uri), upsert: false }
  );
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.from('stories').insert({
    couple_id: coupleId,
    author_id: userId,
    image_path: imagePath,
  });
  if (insertError) {
    await supabase.storage.from('stories').remove([imagePath]);
    throw insertError;
  }
}
