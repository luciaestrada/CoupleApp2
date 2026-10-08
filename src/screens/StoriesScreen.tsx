import React, { useEffect, useState } from 'react';
import {
  View,
  Modal,
  ActivityIndicator,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { colors } from '../ui/theme';
import { Action, EmptyState } from '../ui/components';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { usePairedAppContext } from '../contexts/AppContext';
import {
  watchActiveStories, pendingStoryUpload, prepareStoryUpload, resumeStoryUpload,
  discardStoryUpload, type StoryUpload,
} from '../services/storiesService';
import type { Couple, Story } from '../types/domain';
import { asError, type AppError } from '../utils/errors';

function StoryVideo({ uri }: { uri: string | undefined }) {
  const player = useVideoPlayer(uri ?? null);
  return <VideoView player={player} nativeControls contentFit="contain" style={{width:'100%',height:320}} />;
}

export default function StoriesScreen() {
  const { userId, couple } = usePairedAppContext();
  return <StoriesContent key={`${userId}:${couple.id}`} userId={userId} couple={couple} />;
}

function StoriesContent({ userId, couple }: { userId: string; couple: Couple }) {
  const [selected, setSelected] = useState<Story | null>(null);
  const [loading, setLoading] = useState(true);
  const [stories, setStories] = useState<Story[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [draft, setDraft] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [pending, setPending] = useState<StoryUpload | null>(() => pendingStoryUpload(userId, couple.id));
  const [caption, setCaption] = useState('');

  useEffect(() => {
    return watchActiveStories(couple.id, {
      onData: (items) => {
        setStories(items);
        setLoading(false);
      },
      onError: (e) => {
        setError(e);
        setLoading(false);
      },
    });
  }, [couple.id]);

  async function handleAddStory() {
    if (uploading || pending) return;
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images','videos'],
        videoMaxDuration: 60,
        quality: 0.7,
      });
      if (result.canceled) return;

      setDraft(result.assets[0]);
      setCaption('');
    } catch (nextError) {
      setError(asError(nextError));
    } finally {
      setUploading(false);
    }
  }

  async function publish() {
    if (!draft || uploading) return;
    setUploading(true); setError(null);
    try {
      const upload = await prepareStoryUpload(couple.id, userId, draft, caption);
      setPending(upload); setDraft(null); setCaption('');
      await resumeStoryUpload(upload);
    }
    catch (next) { setError(asError(next)); }
    finally { setPending(pendingStoryUpload(userId, couple.id)); setUploading(false); }
  }

  async function resolvePending(discard: boolean) {
    if (!pending || uploading) return;
    setUploading(true); setError(null);
    try {
      if (discard) await discardStoryUpload(pending);
      else await resumeStoryUpload(pending);
    } catch (next) { setError(asError(next)); }
    finally { setPending(pendingStoryUpload(userId, couple.id)); setUploading(false); }
  }

  return (
    <View style={styles.container}>
      <Text style={{ color: colors.muted, marginBottom: 12, lineHeight: 21 }}>
        Fotos o vídeos de hasta 60 segundos, con vuestro texto. Desaparecen a las 24 horas; queda una mención en el chat.
      </Text>
      <Action
        title="Compartir foto o vídeo"
        disabled={!!pending}
        loading={uploading}
        onPress={handleAddStory}
        style={{ marginBottom: 16 }}
      />

      {pending && <View style={{ gap: 8, marginBottom: 16 }}>
        <Text>Hay una historia pendiente de publicar. Puedes reintentarla o descartarla antes de compartir otra.</Text>
        {!!pending.caption && <Text numberOfLines={2}>{pending.caption}</Text>}
        <Action title="Reintentar historia" loading={uploading} onPress={() => void resolvePending(false)} />
        <Action title="Descartar historia pendiente" secondary disabled={uploading} onPress={() => void resolvePending(true)} />
      </View>}

      {error && <Text style={styles.error}>{error.message}</Text>}

      <FlatList
        data={stories}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={item.mediaType==='video'?'Abrir vídeo compartido':'Ampliar foto compartida'}
            onPress={() => setSelected(item)}
            style={styles.storyCard}
          >
            {item.mediaType==='video' ? <View style={[styles.storyImage,{backgroundColor:colors.primarySoft,alignItems:'center',justifyContent:'center'}]}><Text style={{fontSize:36}}>▶</Text><Text>Vídeo</Text></View> : <Image source={{ uri: item.imageUrl }} style={styles.storyImage} />}
            {!!item.caption && <Text numberOfLines={2} style={{padding:6}}>{item.caption}</Text>}
            <Text style={styles.storyAuthor}>
              {item.authorId === userId ? 'Tú' : 'Tu pareja'}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.primary} style={{ margin: 32 }} />
          ) : (
            <EmptyState
              title="Un momento para compartir"
              description="Comparte una foto o un vídeo de vuestro día."
            />
          )
        }
      />
      <Modal
        visible={!!selected}
        onRequestClose={() => setSelected(null)}
        animationType="fade"
      >
        <SafeAreaView
          style={{ flex: 1, backgroundColor: '#20151B', padding: 16 }}
        >
          <Action
            title="Cerrar historia"
            secondary
            onPress={() => setSelected(null)}
          />
          {selected?.mediaType==='video' ? <StoryVideo uri={selected.imageUrl} /> : selected && (
            <Image
              source={{ uri: selected.imageUrl }}
              resizeMode="contain"
              style={{ flex: 1, marginTop: 16 }}
              accessibilityLabel="Foto compartida ampliada"
            />
          )}
          {!!selected?.caption && <ScrollView style={{maxHeight:160}}><Text style={{color:'white',fontSize:17,paddingVertical:16}}>{selected.caption}</Text></ScrollView>}
        </SafeAreaView>
      </Modal>
      <Modal visible={!!draft} onRequestClose={()=>{if(!uploading)setDraft(null);}} animationType="slide">
        <SafeAreaView style={{flex:1,backgroundColor:colors.background}}>
          <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,gap:16}}>
              <Text style={{fontSize:24,fontWeight:'700'}}>Nueva historia</Text>
              {draft?.type==='video' ? <StoryVideo uri={draft.uri} /> : draft && <Image source={{uri:draft.uri}} resizeMode="contain" style={{height:280,width:'100%'}} />}
              <Text>Añadir texto</Text>
              <TextInput accessibilityLabel="Texto de la historia" editable={!uploading} multiline maxLength={1000}
                placeholder="Cuenta este momento…" value={caption} onChangeText={setCaption}
                style={{minHeight:100,borderWidth:1,borderColor:colors.border,borderRadius:12,padding:12,textAlignVertical:'top'}} />
              <Text style={{color:colors.muted}}>{caption.length}/1000 · Vídeos: máximo 50 MiB</Text>
              {error && <Text accessibilityRole="alert" style={styles.error}>{error.message}</Text>}
              <Action title={uploading?'Publicando…':'Publicar historia'} loading={uploading} onPress={publish} />
              <Action title="Cancelar" secondary disabled={uploading} onPress={()=>setDraft(null)} />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20 },
  addButton: {
    backgroundColor: '#FF6B81',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  addButtonText: { color: '#fff', fontWeight: '700' },
  grid: { gap: 8 },
  storyCard: { flex: 1, margin: 4, borderRadius: 12, overflow: 'hidden' },
  storyImage: { width: '100%', aspectRatio: 1, borderRadius: 12 },
  storyAuthor: {
    textAlign: 'center',
    marginTop: 4,
    color: '#666',
    fontSize: 12,
  },
  empty: { textAlign: 'center', marginTop: 40, color: '#999' },
  error: { color: '#B42318', marginBottom: 8 },
});
