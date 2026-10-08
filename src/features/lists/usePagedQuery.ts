import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { createPagedCollection, type PageSnapshot } from './pagedCollection';
import { asError, type AppError } from '../../utils/errors';
import type { Handlers } from '../../types/domain';

export function usePagedQuery<T extends { id: string }>(key: string, {
  load, watch, compare,
}: { load(cursor: T | null): Promise<T[]>; watch(handlers: Handlers<T[]>): () => void; compare(a: T,b: T): number }) {
  const [state, setState] = useState<PageSnapshot<T>>({ items: [], more: false, loaded: false });
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);
  const configuration = useRef({ key, load, watch, compare });
  useLayoutEffect(() => { configuration.current = { key, load, watch, compare }; });
  const current = useRef<ReturnType<typeof createPagedCollection<T>> | null>(null);
  useFocusEffect(useCallback(() => {
    let alive = true;
    const config = configuration.current;
    if (config.key !== key) return;
    const collection = createPagedCollection<T>({ load: config.load, compare: config.compare,
      onData: value => { if (alive) { setState(value); setError(null); } } });
    current.current = collection;
    setState({ items: [], more: false, loaded: false });
    const stop = config.watch({ onData: () => { void collection.refresh().catch(value => { if (alive) setError(asError(value)); }); },
      onError: value => { if (alive) setError(value); } });
    return () => { alive = false; collection.dispose(); stop(); if (current.current === collection) current.current = null; };
  }, [key]));
  const refresh = useCallback(async () => { await current.current?.refresh(); }, []);
  const next = useCallback(async () => {
    const collection = current.current;
    if (!collection) return;
    setBusy(true);
    try { await collection.next(); }
    catch (value) { if (current.current === collection) setError(asError(value)); }
    finally { if (current.current === collection) setBusy(false); }
  }, []);
  return { ...state, error, busy, refresh, next };
}
