// Persist only revocations. Granting permission must always be an online action.
import type { KeyValueStorage } from '../../persistence/storage';
export function createPrivacyQueue<T>({ storage, currentUser, send }: {
  storage: Pick<KeyValueStorage, 'getItem' | 'setItem' | 'removeItem'>;
  currentUser(): Promise<string | null>; send(userId: string, pauseLocation: boolean): Promise<T>;
}) {
  const key = (userId: string) => `coupleapp.privacy.pending.${userId}`;
  const running = new Map<string, Promise<T | null>>();
  function pending(userId: string | null): { pauseLocation: boolean; revision: number } | null {
    if (!userId) return null;
    try { return JSON.parse(storage.getItem(key(userId)) ?? 'null'); }
    catch { return null; }
  }
  function enqueue(userId: string, pauseLocation: boolean) {
    const previous = pending(userId);
    storage.setItem(key(userId), JSON.stringify({
      pauseLocation: pauseLocation || previous?.pauseLocation === true,
      revision: (previous?.revision ?? 0) + 1,
    }));
  }
  async function drain(userId: string) {
    let result: T | null = null;
    for (;;) {
      const item = pending(userId);
      if (!item || await currentUser() !== userId) return result;
      // The server also checks expectedUser: a session can change during await.
      result = await send(userId, item.pauseLocation);
      if (pending(userId)?.revision === item.revision) storage.removeItem(key(userId));
    }
  }
  function flush(userId: string) {
    const existing = running.get(userId);
    if (existing) return existing;
    const operation = drain(userId).finally(() => running.delete(userId));
    running.set(userId, operation);
    return operation;
  }
  return { pending, enqueue, flush };
}
