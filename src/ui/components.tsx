import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors } from './theme';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';

interface ActionProps {
  title: string; onPress?: PressableProps['onPress']; onLongPress?: PressableProps['onLongPress'];
  disabled?: boolean; loading?: boolean; secondary?: boolean; style?: StyleProp<ViewStyle>;
}

export function Action({
  title,
  onPress,
  onLongPress,
  disabled = false,
  loading = false,
  secondary = false,
  style,
}: ActionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.action,
        secondary && styles.secondary,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading && (
        <ActivityIndicator
          color={secondary ? colors.primary : colors.surface}
        />
      )}
      <Text style={[styles.actionText, secondary && { color: colors.primary }]}>
        {title}
      </Text>
    </Pressable>
  );
}
export function EmptyState({ title, description, action, onAction }: {
  title: string; description?: string; action?: string; onAction?: PressableProps['onPress'];
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {action && <Action title={action} onPress={onAction} secondary />}
    </View>
  );
}
export function Banner({ children, success = false }: React.PropsWithChildren<{ success?: boolean }>) {
  return (
    <View style={[styles.banner, success && { backgroundColor: '#EAF6EF' }]}>
      <Text
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={{
          color: success ? colors.success : colors.danger,
          lineHeight: 21,
        }}
      >
        {children}
      </Text>
    </View>
  );
}
export function MenuRow({ title, description, symbol, onPress }: {
  title: string; description?: string; symbol?: string; onPress?: PressableProps['onPress'];
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.menu, pressed && styles.pressed]}
    >
      {symbol && (
        <Text accessible={false} style={styles.symbol}>
          {symbol}
        </Text>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.menuTitle}>{title}</Text>
        {description && <Text style={styles.description}>{description}</Text>}
      </View>
      <Text accessible={false} style={styles.chevron}>
        ›
      </Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  action: {
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: { backgroundColor: colors.primarySoft },
  actionText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
  empty: { padding: 24, gap: 12, alignItems: 'stretch' },
  emptyTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  description: { color: colors.muted, lineHeight: 21, fontSize: 14 },
  banner: {
    backgroundColor: '#FFF0ED',
    padding: 14,
    marginVertical: 8,
    borderRadius: 12,
  },
  menu: {
    minHeight: 80,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 3,
  },
  symbol: {
    fontSize: 24,
    color: colors.primary,
    width: 32,
    textAlign: 'center',
  },
  chevron: { fontSize: 28, color: colors.muted },
});
