import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { usePairedAppContext } from '../contexts/AppContext';
import {
  watchNotifications,
  openNotification,
} from '../services/notificationService';
import { colors } from '../ui/theme';
import { Banner, EmptyState } from '../ui/components';
export default function NotificationsScreen() {
  const { userId } = usePairedAppContext();
  const [items, setItems] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(null);
  const [unreadOnly, setUnreadOnly] = useState(false),
    [opening, setOpening] = useState(null);
  useEffect(
    () =>
      watchNotifications(userId, {
        onData: (data) => {
          setItems(data);
          setLoading(false);
          setError(null);
        },
        onError: (e) => {
          setLoading(false);
          setError(e);
        },
      }),
    [userId],
  );
  const unread = items.filter((item) => !item.read_at);
  return (
    <View style={{ flex: 1, padding: 20, backgroundColor: colors.background }}>
      <Text style={{ fontSize: 24, color: colors.text, fontWeight: '700' }}>
        Vuestras novedades
      </Text>
      <Text style={{ color: colors.muted, marginVertical: 10 }}>
        {unread.length ? `${unread.length} avisos sin leer` : 'Estás al día'}
      </Text>
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
        {[
          [false, 'Todos'],
          [true, 'Sin leer'],
        ].map(([value, title]) => (
          <TouchableOpacity
            key={title}
            accessibilityRole="button"
            accessibilityState={{ selected: unreadOnly === value }}
            onPress={() => setUnreadOnly(value)}
            style={{
              minHeight: 44,
              paddingHorizontal: 18,
              justifyContent: 'center',
              backgroundColor:
                unreadOnly === value ? colors.primary : colors.primarySoft,
              borderRadius: 22,
            }}
          >
            <Text
              style={{
                color: unreadOnly === value ? colors.surface : colors.primary,
                fontWeight: '600',
              }}
            >
              {title}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {error && <Banner>{error.message}</Banner>}
      <FlatList
        data={unreadOnly ? unread : items}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.primary} style={{ margin: 32 }} />
          ) : (
            <EmptyState
              title={
                unreadOnly ? 'Todo leído' : 'Aquí llegarán vuestros avisos'
              }
              description={
                unreadOnly
                  ? 'Puedes volver a ver todos los avisos cuando quieras.'
                  : 'Mensajes, fechas y momentos compartidos aparecerán en esta bandeja.'
              }
            />
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            accessibilityRole="button"
            disabled={opening !== null}
            onPress={async () => {
              setOpening(item.id);
              setError(null);
              try {
                if (!(await openNotification(item.id)))
                  setError(
                    new Error(
                      'Este aviso pertenece a contenido que ya no está disponible.',
                    ),
                  );
              } catch (e) {
                setError(e);
              } finally {
                setOpening(null);
              }
            }}
            style={{
              backgroundColor: colors.surface,
              borderLeftWidth: 4,
              borderLeftColor: item.read_at ? colors.border : colors.primary,
              padding: 18,
              borderRadius: 14,
              marginBottom: 12,
            }}
          >
            <Text
              style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}
            >
              {item.title}
            </Text>
            <Text style={{ color: colors.muted, lineHeight: 21, marginTop: 6 }}>
              {item.body}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 10 }}>
              {new Date(item.created_at).toLocaleString('es-ES', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
              {!item.read_at ? ' · Sin leer' : ''}
            </Text>
            {opening === item.id && (
              <ActivityIndicator color={colors.primary} />
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
