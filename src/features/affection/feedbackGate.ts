import type { Message } from '../../types/domain';
import type { KeyValueStorage } from '../../persistence/storage';
export function createFeedbackGate({ storage, key, userId, now = Date.now }: { storage: Pick<KeyValueStorage, 'getItem' | 'setItem'>; key: string; userId: string; now?: () => number }) {
  let baseline = false;
  let seen: Set<string>;
  try { seen = new Set(JSON.parse(storage.getItem(key) ?? '[]')); } catch { seen = new Set(); }
  function remember(id: string) {
    seen.add(id);
    while (seen.size > 100) seen.delete(seen.values().next().value!);
  }
  return {
    reset() { baseline = false; },
    accept(messages: Message[]) {
      const current = now();
      let feedback = false;
      for (const message of messages) {
        if (message.type !== 'love' || message.senderId === userId) continue;
        const age = current - Date.parse(message.createdAt);
        if (baseline && !seen.has(message.id) && age >= 0 && age < 15000) feedback = true;
        remember(message.id);
      }
      baseline = true;
      storage.setItem(key, JSON.stringify([...seen]));
      return feedback; // At most one effect for a batch of gestures.
    },
  };
}
