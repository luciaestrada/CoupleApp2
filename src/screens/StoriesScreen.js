import React, { useEffect, useState } from 'react';
import { View, FlatList, Image, TouchableOpacity, StyleSheet, Text } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db, storage } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { useCouple } from '../context/CoupleContext';

export default function StoriesScreen() {
  const { userProfile } = useAuth();
  const { couple } = useCouple();
  const [stories, setStories] = useState([]);

  useEffect(() => {
    if (!couple?.id) return;
    const q = query(collection(db, 'couples', couple.id, 'stories'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const now = Date.now();
      setStories(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((s) => !s.expiresAt || s.expiresAt.toMillis() > now)
      );
    });
    return unsub;
  }, [couple?.id]);

  async function handlePickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (result.canceled) return;

    const response = await fetch(result.assets[0].uri);
    const blob = await response.blob();
    const filename = `stories/${couple.id}/${Date.now()}.jpg`;
    const storageRef = ref(storage, filename);
    await uploadBytes(storageRef, blob);
    const imageUrl = await getDownloadURL(storageRef);

    const expiresAt = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);
    await addDoc(collection(db, 'couples', couple.id, 'stories'), {
      authorId: userProfile.id,
      imageUrl,
      createdAt: serverTimestamp(),
      expiresAt,
    });
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.addButton} onPress={handlePickImage}>
        <Text style={styles.addButtonText}>+ Nueva historia</Text>
      </TouchableOpacity>
      <FlatList
        data={stories}
        horizontal
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Image source={{ uri: item.imageUrl }} style={styles.thumbnail} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12 },
  addButton: { backgroundColor: '#D6336C', padding: 10, borderRadius: 20, alignItems: 'center', marginBottom: 10 },
  addButtonText: { color: 'white', fontWeight: '600' },
  thumbnail: { width: 90, height: 140, borderRadius: 10, marginRight: 8 },
});
