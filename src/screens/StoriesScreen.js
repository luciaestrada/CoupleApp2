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
import { useAppContext } from "../contexts/AppContext";
import { watchActiveStories, uploadStory } from "../services/storiesService";

export default function StoriesScreen() {
  const { userId, couple } = useAppContext();
  const [stories, setStories] = useState([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!couple) return;
    return watchActiveStories(couple.id, setStories);
  }, [couple?.id]);

  async function handleAddStory() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled || !couple || !userId) return;

    setUploading(true);
    try {
      await uploadStory(couple.id, userId, result.assets[0].uri);
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
});
