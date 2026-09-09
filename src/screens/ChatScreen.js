import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { usePairedAppContext } from '../contexts/AppContext';
import {
  sendMessage,
  watchMessages,
  getPendingMessages,
  retryPendingMessages,
  loadOlderMessages,
} from '../services/chatService';
import { sendLove, watchStreaks } from '../services/streakService';
import { colors } from '../ui/theme';
import { EmptyState } from '../ui/components';
import { useHeaderHeight } from '@react-navigation/elements';
import { todayInMadrid } from '../utils/dateUtils';

export default function ChatScreen() {
  const { userId, partnerId, couple } = usePairedAppContext();
  const [pending, setPending] = useState(() => getPendingMessages(userId));
  const [older, setOlder] = useState([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [messages, setMessages] = useState([]);
  const [streaks, setStreaks] = useState(couple.streaks ?? []);
  const draftKey = 'coupleapp.draft.' + userId + '.' + couple.id;
  const [text, setText] = useState(() => localStorage.getItem(draftKey) ?? '');
  const headerHeight = useHeaderHeight();
  const [loading, setLoading] = useState(true);
  const [sendingLove, setSendingLove] = useState(false);
  function changeText(value) { setText(value); if (value) localStorage.setItem(draftKey, value); else localStorage.removeItem(draftKey); }
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    return watchMessages(couple.id, { onData: (items) => { setMessages(items); setLoading(false); }, onError: (e) => { setError(e); setLoading(false); } });
  }, [couple.id]);

  useEffect(() => {
    return watchStreaks(couple.id, { onData: setStreaks, onError: setError });
  }, [couple.id]);

  async function handleSend() {
    if (!text.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const result = await sendMessage(couple.id, text);
      if (result.error) setError(result.error);
      changeText('');
    } catch (nextError) {
      setError(nextError);
    } finally {
      setPending(getPendingMessages(userId));
      setSending(false);
    }
  }

  async function handleSendLove() {
    if (sendingLove) return;
    setSendingLove(true);
    setError(null);
    try {
      await sendLove(couple.id);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setSendingLove(false);
    }
  }

  const myStreak =
    streaks.find((streak) => streak.userId === userId)?.count ?? 0;
  const partnerStreak =
    streaks.find((streak) => streak.userId === partnerId)?.count ?? 0;
  const sentLoveToday =
    streaks.find((streak) => streak.userId === userId)?.lastConfirmedDay ===
    todayInMadrid();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      keyboardVerticalOffset={headerHeight}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.streakBar}>
        <Text style={styles.streakText}>
          🔥 Tú {myStreak} · Pareja {partnerStreak}
        </Text>
        <TouchableOpacity disabled={sentLoveToday || sendingLove} onPress={handleSendLove} accessibilityRole="button" style={{ minHeight: 48, justifyContent: 'center' }}>
          <Text
            style={[styles.loveTapButton, sentLoveToday && styles.disabledText]}
          >
            {sentLoveToday ? '✓ Enviado hoy' : '💜 Enviar amor'}
          </Text>
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.error}>{error.message}</Text>}

      <FlatList
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={loading ? <ActivityIndicator style={{ padding: 32 }} color={colors.primary} /> : <View style={{ transform: [{ scaleY: -1 }] }}><EmptyState title="Vuestra conversación empieza aquí" description="Un saludo, una idea o algo que te haya hecho sonreír." /></View>}
        data={[
          ...messages,
          ...older.filter(
            (item) => !messages.some((recent) => recent.id === item.id),
          ),
        ]}
        ListFooterComponent={
          hasMore && messages.length > 0 ? (
            <TouchableOpacity
              disabled={loadingOlder}
              onPress={async () => {
                setLoadingOlder(true);
                try {
                  const page = await loadOlderMessages(
                    couple.id,
                    older.at(-1) ?? messages.at(-1),
                  );
                  setOlder((current) => [...current, ...page]);
                  setHasMore(page.length === 50);
                } catch (next) {
                  setError(next);
                } finally {
                  setLoadingOlder(false);
                }
              }}
            >
              <Text style={{ textAlign: 'center', padding: 16 }}>
                {loadingOlder ? 'Cargando…' : 'Cargar anteriores'}
              </Text>
            </TouchableOpacity>
          ) : null
        }
        inverted
        keyExtractor={(item) => item.id}
        style={styles.list}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.senderId === userId
                ? styles.bubbleMine
                : styles.bubbleTheirs,
            ]}
          >
            <Text
              style={[
                styles.bubbleText,
                item.senderId === userId && { color: '#fff' },
              ]}
            >
              {item.loveTap ? '💜' : item.text}
            </Text>
            <Text style={{ fontSize: 11, marginTop: 5, alignSelf: 'flex-end', color: item.senderId === userId ? '#FFE9F0' : colors.muted }}>{new Date(item.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</Text>
          </View>
        )}
      />

      {pending.length > 0 && (
        <View style={{ padding: 12, backgroundColor: '#FFF8E6' }}>
          <Text>
            {pending.length} mensaje(s) pendiente(s):{' '}
            {pending.map((item) => item.text).join(' · ')}
          </Text>
          <TouchableOpacity
            disabled={sending}
            onPress={async () => {
              setSending(true);
              try {
                await retryPendingMessages(userId);
                setError(null);
              } catch (next) {
                setError(next);
              } finally {
                setPending(getPendingMessages(userId));
                setSending(false);
              }
            }}
          >
            <Text>Reintentar pendientes</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={changeText}
          accessibilityLabel="Mensaje para tu pareja"
          multiline
          textAlignVertical="top"
          maxLength={2000}
          placeholder="Escribe un mensaje..."
        />
        <TouchableOpacity
          disabled={sending || !text.trim()}
          accessibilityRole="button"
          style={[styles.sendButton, (sending || !text.trim()) && { opacity: 0.4 }]}
          onPress={handleSend}
        >
          {sending ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.sendButtonText}>Enviar</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  streakBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#FFF0F3',
  },
  streakText: { fontWeight: '700', color: '#333' },
  loveTapButton: { fontWeight: '700', color: colors.primary },
  disabledText: { color: '#888' },
  list: { flex: 1, paddingHorizontal: 12 },
  bubble: { maxWidth: '75%', borderRadius: 16, padding: 10, marginVertical: 4 },
  bubbleMine: { backgroundColor: colors.primary, alignSelf: 'flex-end' },
  bubbleTheirs: { backgroundColor: '#eee', alignSelf: 'flex-start' },
  bubbleText: { color: '#000' },
  inputBar: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderColor: '#eee',
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 130,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sendButton: { minWidth: 64, minHeight: 48, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  sendButtonText: { color: colors.primary, fontWeight: '700' },
  error: { color: '#B42318', paddingHorizontal: 12, paddingVertical: 8 },
});
