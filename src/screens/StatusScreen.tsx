import React, { useCallback, useState } from 'react';
import { AppState, ScrollView, type AppStateStatus } from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { usePairedAppContext } from '../contexts/AppContext';
import CheckinCard from '../ui/CheckinCard';
import { colors } from '../ui/theme';

export default function StatusScreen() {
  const { userId, couple } = usePairedAppContext();
  const focused = useIsFocused();
  const [now, setNow] = useState(Date.now);
  useFocusEffect(useCallback(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const refresh = (state: AppStateStatus) => {
      clearInterval(timer);
      if (state === 'active') {
        setNow(Date.now());
        timer = setInterval(() => setNow(Date.now()), 30000);
      }
    };
    refresh(AppState.currentState);
    const subscription = AppState.addEventListener('change', refresh);
    return () => { clearInterval(timer); subscription.remove(); };
  }, []));
  return (
    <ScrollView keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ flexGrow: 1, padding: 16, backgroundColor: colors.background }}>
      {focused && <CheckinCard key={couple.id} coupleId={couple.id} userId={userId} now={now} />}
    </ScrollView>
  );
}
