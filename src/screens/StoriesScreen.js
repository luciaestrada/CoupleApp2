import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { usePairedAppContext } from '../contexts/AppContext';
import { watchActiveStories, uploadStory } from "../services/storiesService";

export default function StoriesScreen() {
  const { userId, couple } = usePairedAppContext();
  const [stories, setStories] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    return watchActiveStories(couple.id, { onData: setStories, onError: setError });
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
      <TouchableOpacity style={styles.addButton} onPress={handleAddStory} disabled={uploading}>
        <Text style={styles.addButtonText}>
          {uploading ? "Subiendo..." : "+ Añadir historia"}
        </Text>
      </TouchableOpacity>

      {error && <Text style={styles.error}>{error.message}</Text>}

      <FlatList
        data={stories}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <View style={styles.storyCard}>
            <Image source={{ uri: item.imageUrl }} style={styles.storyImage} />
            <Text style={styles.storyAuthor}>
              {item.authorId === userId ? "Tú" : "Tu pareja"}
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No hay historias activas.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 12 },
  addButton: { backgroundColor: "#FF6B81", borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 12 },
  addButtonText: { color: "#fff", fontWeight: "700" },
  grid: { gap: 8 },
  storyCard: { flex: 1, margin: 4, borderRadius: 12, overflow: "hidden" },
  storyImage: { width: "100%", aspectRatio: 1, borderRadius: 12 },
  storyAuthor: { textAlign: "center", marginTop: 4, color: "#666", fontSize: 12 },
  empty: { textAlign: "center", marginTop: 40, color: "#999" },
  error: { color: '#B42318', marginBottom: 8 },
});
