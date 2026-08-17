import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { getMyCouple, watchMyCouple } from '../services/coupleService';

const CoupleContext = createContext(null);

export function CoupleProvider({ children }) {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState({ userId: null, couple: null, error: null });
  const [refreshing, setRefreshing] = useState(false);
  const couple = snapshot.userId === user?.id ? snapshot.couple : null;
  const error = snapshot.userId === user?.id ? snapshot.error : null;
  const loading = Boolean(user?.id && snapshot.userId !== user.id) || refreshing;

  const refreshCouple = useCallback(async () => {
    if (!user?.id) {
      return null;
    }

    setRefreshing(true);
    try {
      const nextCouple = await getMyCouple();
      setSnapshot({ userId: user.id, couple: nextCouple, error: null });
      return nextCouple;
    } catch (nextError) {
      setSnapshot((current) => ({
        userId: user.id,
        couple: current.userId === user.id ? current.couple : null,
        error: nextError,
      }));
      throw nextError;
    } finally {
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return undefined;

    return watchMyCouple(user.id, couple?.id, {
      onData: (nextCouple) => {
        setSnapshot({ userId: user.id, couple: nextCouple, error: null });
      },
      onError: (nextError) => {
        setSnapshot((current) => ({
          userId: user.id,
          couple: current.userId === user.id ? current.couple : null,
          error: nextError,
        }));
      },
    });
  }, [couple?.id, user?.id]);

  const value = useMemo(
    () => ({ couple, loading, error, refreshCouple }),
    [couple, error, loading, refreshCouple]
  );

  return <CoupleContext.Provider value={value}>{children}</CoupleContext.Provider>;
}

export function useCouple() {
  const context = useContext(CoupleContext);
  if (!context) throw new Error('useCouple debe usarse dentro de CoupleProvider.');
  return context;
}
