import React, { useEffect, useState } from "react";
import {
  View,
  Modal,
  ActivityIndicator,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { colors } from '../ui/theme';
import { Action, EmptyState } from '../ui/components';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from "expo-image-picker";
import { usePairedAppContext } from '../contexts/AppContext';
import { watchActiveStories, uploadStory } from "../services/storiesService";

export default function StoriesScreen() {
  const { userId, couple } = usePairedAppContext();
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stories, setStories] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    return watchActiveStories(couple.id, { onData: (items) => { setStories(items); setLoading(false); }, onError: (e) => { setError(e); setLoading(false); } });
  }, [couple.id]);

  async function handleAddStory() {
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });
      if (result.canceled) return;

      setUploading(true);
      await uploadStory(couple.id, userId, result.assets[0]);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setUploading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={{ color: colors.muted, marginBottom: 12, lineHeight: 21 }}>Una foto para compartir vuestro día. Las historias desaparecen a las 24 horas.</Text>
      <Action title={uploading ? "Subiendo foto…" : "Compartir una foto"} loading={uploading} onPress={handleAddStory} style={{ marginBottom: 16 }} />

      {error && <Text style={styles.error}>{error.message}</Text>}

      <FlatList
        data={stories}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Ampliar foto compartida" onPress={() => setSelected(item)} style={styles.storyCard}>
            <Image source={{ uri: item.imageUrl }} style={styles.storyImage} />
            <Text style={styles.storyAuthor}>
              {item.authorId === userId ? "Tú" : "Tu pareja"}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={loading ? <ActivityIndicator color={colors.primary} style={{ margin: 32 }} /> : <EmptyState title="Un momento para compartir" description="Añade la primera foto de vuestro día." />}
      />
      <Modal visible={!!selected} onRequestClose={() => setSelected(null)} animationType="fade"><SafeAreaView style={{ flex: 1, backgroundColor: '#20151B', padding: 16 }}><Action title="Cerrar foto" secondary onPress={() => setSelected(null)} />{selected && <Image source={{ uri: selected.imageUrl }} resizeMode="contain" style={{ flex: 1, marginTop: 16 }} accessibilityLabel="Foto compartida ampliada" />}</SafeAreaView></Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20 },
  addButton: { backgroundColor: "#FF6B81", borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 12 },
  addButtonText: { color: "#fff", fontWeight: "700" },
  grid: { gap: 8 },
  storyCard: { flex: 1, margin: 4, borderRadius: 12, overflow: "hidden" },
  storyImage: { width: "100%", aspectRatio: 1, borderRadius: 12 },
  storyAuthor: { textAlign: "center", marginTop: 4, color: "#666", fontSize: 12 },
  empty: { textAlign: "center", marginTop: 40, color: "#999" },
  error: { color: '#B42318', marginBottom: 8 },
});
