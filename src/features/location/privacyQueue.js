// Persist only revocations. Granting permission must always be an online action.
export function createPrivacyQueue({ storage, currentUser, send }) {
  const key = userId => `coupleapp.privacy.pending.${userId}`;
  const running = new Map();
  function pending(userId) {
    if (!userId) return null;
    try { return JSON.parse(storage.getItem(key(userId)) ?? 'null'); }
    catch { return null; }
  }
  function enqueue(userId, pauseLocation) {
    const previous = pending(userId);
    storage.setItem(key(userId), JSON.stringify({
      pauseLocation: pauseLocation || previous?.pauseLocation === true,
      revision: (previous?.revision ?? 0) + 1,
    }));
  }
  async function drain(userId) {
    let result = null;
    for (;;) {
      const item = pending(userId);
      if (!item || await currentUser() !== userId) return result;
      // The server also checks expectedUser: a session can change during await.
      result = await send(userId, item.pauseLocation);
      if (pending(userId)?.revision === item.revision) storage.removeItem(key(userId));
    }
  }
  function flush(userId) {
    if (running.has(userId)) return running.get(userId);
    const operation = drain(userId).finally(() => running.delete(userId));
    running.set(userId, operation);
    return operation;
  }
  return { pending, enqueue, flush };
}
