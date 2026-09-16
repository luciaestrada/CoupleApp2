export function createFeedbackGate({ storage, key, userId, now = Date.now }) {
  let baseline = false;
  let seen;
  try { seen = new Set(JSON.parse(storage.getItem(key) ?? '[]')); } catch { seen = new Set(); }
  function remember(id) {
    seen.add(id);
    while (seen.size > 100) seen.delete(seen.values().next().value);
  }
  return {
    reset() { baseline = false; },
    accept(messages) {
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
