import { asError, type AppError } from '../utils/errors';
import { usePagedQuery } from '../features/lists/usePagedQuery';
import type { Message } from '../types/domain';
import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
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
  discardPendingMessage,
  watchPendingMessages,
} from '../services/chatService';
import { sendLove, watchStreaks } from '../services/streakService';
import { colors } from '../ui/theme';
import { EmptyState } from '../ui/components';
import { useHeaderHeight } from '@react-navigation/elements';
import { todayInMadrid } from '../utils/dateUtils';
import TripPreview from '../ui/TripPreview';
import { activityLabel } from '../features/home/activity';

export default function ChatScreen({ navigation }) {
  const { userId, partnerId, couple } = usePairedAppContext();
  const [pending, setPending] = useState(() => getPendingMessages(userId, couple.id));
  const page = usePagedQuery<Message>(couple.id, {
    load: cursor => loadOlderMessages(couple.id, cursor),
    watch: handlers => watchMessages(couple.id, handlers),
    compare: (a,b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
  });
  const messages = page.items;
  const list = useRef<FlatList<Message>>(null);
  const nearNewest = useRef(true);
  useEffect(() => watchPendingMessages(() => setPending(getPendingMessages(userId, couple.id))), [userId, couple.id]);
  const [streaks, setStreaks] = useState(couple.streaks ?? []);
  const draftKey = 'coupleapp.draft.' + userId + '.' + couple.id;
  const [text, setText] = useState(() => localStorage.getItem(draftKey) ?? '');
  const headerHeight = useHeaderHeight();
  const loading = !page.loaded;
  const [sendingLove, setSendingLove] = useState(false);
  const [tripId,setTripId] = useState(null);
  function changeText(value) {
    setText(value);
    if (value) localStorage.setItem(draftKey, value);
    else localStorage.removeItem(draftKey);
  }
  const [error, setError] = useState<AppError | null>(null);
  const [sending, setSending] = useState(false);

  useFocusEffect(useCallback(() => {
    return watchStreaks(couple.id, { onData: setStreaks, onError: setError });
  }, [couple.id]));

  async function handleSend() {
    if (!text.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const result = await sendMessage(couple.id, text);
      if (result.error) setError(result.error);
      changeText('');
    } catch (nextError) {
      setError(asError(nextError));
    } finally {
      setPending(getPendingMessages(userId, couple.id));
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
      setError(asError(nextError));
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
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.streakBar}>
        <Text style={styles.streakText}>
          🔥 Tú {myStreak} · Pareja {partnerStreak}
        </Text>
        <TouchableOpacity
          disabled={sendingLove}
          onPress={handleSendLove}
          accessibilityRole="button"
          style={{ minHeight: 48, justifyContent: 'center' }}
        >
          <Text
            style={styles.loveTapButton}
          >
            {sentLoveToday ? '💜 Enviar otra vez' : '💜 Enviar amor'}
          </Text>
        </TouchableOpacity>
      </View>

      {(error || page.error) && <Text style={styles.error}>{(error || page.error)?.message}</Text>}

      <FlatList
        ref={list}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        onScroll={event => { nearNewest.current = event.nativeEvent.contentOffset.y < 80; }}
        onContentSizeChange={() => { if (nearNewest.current) list.current?.scrollToOffset({ offset: 0, animated: false }); }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ padding: 32 }} color={colors.primary} />
          ) : (
            <View>
              <EmptyState
                title="Vuestra conversación empieza aquí"
                description="Un saludo, una idea o algo que te haya hecho sonreír."
              />
            </View>
          )
        }
        data={messages}
        ListFooterComponent={page.more ? <TouchableOpacity disabled={page.busy} onPress={() => void page.next()}>
          <Text style={{textAlign:'center',padding:16}}>{page.busy ? 'Cargando…' : 'Cargar anteriores'}</Text>
        </TouchableOpacity> : null}
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
            {item.type==='event' && <Text style={{fontSize:11,color:item.senderId===userId?'#FFE9F0':colors.muted}}>
              {item.senderId===userId?'Tú':'Tu pareja'} · {activityLabel(item)}
            </Text>}
            <Text
              style={[
                styles.bubbleText,
                item.senderId === userId && { color: '#fff' },
              ]}
            >
              {item.loveTap ? item.text || '💜' : item.text}
            </Text>
            {item.metadata?.kind==='question' && <TouchableOpacity accessibilityRole="button" onPress={()=>navigation.navigate('Preguntas',{questionId:item.metadata.questionId})} style={{minHeight:48,justifyContent:'center'}}>
              <Text style={{color:item.senderId===userId?'white':colors.primary}}>Ver vuestras respuestas</Text>
            </TouchableOpacity>}
            {item.metadata?.kind==='story' && <TouchableOpacity accessibilityRole="button" onPress={()=>navigation.navigate('Historias')} style={{minHeight:48,justifyContent:'center'}}>
              <Text style={{color:item.senderId===userId?'white':colors.primary}}>Ver historias disponibles</Text>
            </TouchableOpacity>}
            {item.metadata?.kind==='trip' && <TouchableOpacity accessibilityRole="button" onPress={()=>setTripId(item.metadata.tripId)} style={{minHeight:48,justifyContent:'center'}}>
              <Text style={{color:item.senderId===userId?'white':colors.primary}}>Ver recorrido en el mapa</Text>
            </TouchableOpacity>}
            <Text
              style={{
                fontSize: 11,
                marginTop: 5,
                alignSelf: 'flex-end',
                color: item.senderId === userId ? '#FFE9F0' : colors.muted,
              }}
            >
              {new Date(item.createdAt).toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>
        )}
      />
      {tripId && <TripPreview key={tripId} id={tripId} onClose={()=>setTripId(null)} />}

      {pending.length > 0 && (
        <View style={{ padding: 12, backgroundColor: '#FFF8E6' }}>
          <Text>
            {pending.length} mensaje(s) pendiente(s):{' '}

          </Text>
          {pending.map(item => <View key={item.id} style={{paddingVertical:6}}>
            <Text>{item.text} · {item.state === 'failed' ? 'No se puede enviar' : 'Pendiente'}</Text>
            {!!item.error && <Text>{item.error}</Text>}
            <TouchableOpacity accessibilityRole="button" onPress={() => discardPendingMessage(userId,couple.id,item.id)}><Text>Descartar</Text></TouchableOpacity>
          </View>)}
          <TouchableOpacity
            disabled={sending}
            onPress={async () => {
              setSending(true);
              try {
                await retryPendingMessages(userId, couple.id, true);
                setError(null);
              } catch (next) {
                setError(asError(next));
              } finally {
                setPending(getPendingMessages(userId, couple.id));
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
          editable={!sending}
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
          style={[
            styles.sendButton,
            (sending || !text.trim()) && { opacity: 0.4 },
          ]}
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
    flexShrink: 0,
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
  sendButton: {
    minWidth: 64,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  sendButtonText: { color: colors.primary, fontWeight: '700' },
  error: { color: '#B42318', paddingHorizontal: 12, paddingVertical: 8 },
});
