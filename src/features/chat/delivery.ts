import { createOutbox, permanentMessageError, type PendingMessage } from '../../persistence/outbox';
import { asError } from '../../utils/errors';

export function createMessageDelivery({ outbox, currentUser, send }: {
  outbox: ReturnType<typeof createOutbox>;
  currentUser(): Promise<string | null>;
  send(userId: string, message: PendingMessage): Promise<void>;
}) {
  let revision = 0;
  const running = new Map<string, Promise<void>>();
  function invalidate() { revision++; }
  function flush(userId: string, coupleId: string): Promise<void> {
    const key = `${userId}:${coupleId}`;
    const existing = running.get(key);
    if (existing) return existing;
    const stamp = revision;
    const operation = (async () => {
      for (;;) {
        if (stamp !== revision || await currentUser() !== userId || stamp !== revision) return;
        const message = outbox.read(userId, coupleId).find(item => item.state !== 'failed');
        if (!message) return;
        outbox.update(userId, coupleId, message.id, { state: 'sending', error: undefined });
        try {
          await send(userId, message);
          if (stamp !== revision) return;
          outbox.update(userId, coupleId, message.id, null);
        } catch (value) {
          if (stamp !== revision) return;
          const error = asError(value), permanent = permanentMessageError(error);
          outbox.update(userId, coupleId, message.id, { state: permanent ? 'failed' : 'pending', error: error.message });
          if (!permanent) throw error;
        }
      }
    })().finally(() => running.delete(key));
    running.set(key, operation);
    return operation;
  }
  return { flush, invalidate };
}
