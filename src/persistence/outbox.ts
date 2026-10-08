import { appStorage, isRecord, readStored, writeStored, type KeyValueStorage } from './storage';

export interface PendingMessage {
  id: string;
  coupleId: string;
  text: string;
  createdAt: string;
  state: 'pending' | 'sending' | 'failed';
  error?: string;
}

function isMessage(value: unknown): value is PendingMessage {
  return isRecord(value) && typeof value.id === 'string' && typeof value.coupleId === 'string'
    && typeof value.text === 'string' && typeof value.createdAt === 'string'
    && ['pending', 'sending', 'failed'].includes(String(value.state));
}

export function createOutbox(storage: KeyValueStorage = appStorage) {
  const key = (userId: string, coupleId: string) => `coupleapp.outbox.${userId}.${coupleId}`;
  function migrate(userId: string) {
    const oldKey = `coupleapp.chat.${userId}`;
    const raw = storage.getItem(oldKey);
    if (!raw) return;
    let rows: unknown;
    try { rows = JSON.parse(raw); } catch { return; }
    if (!Array.isArray(rows)) return;
    const groups = new Map<string, PendingMessage[]>();
    for (const row of rows) {
      if (!isRecord(row)) continue;
      const message = { ...row, state: 'pending' };
      if (!isMessage(message)) continue;
      groups.set(message.coupleId, [...(groups.get(message.coupleId) ?? []), message]);
    }
    for (const [coupleId, messages] of groups) {
      const current = readStored(key(userId, coupleId), isMessages, [], storage);
      const combined = new Map([...messages, ...current].map(message => [message.id, message]));
      writeStored(key(userId, coupleId), [...combined.values()], storage);
    }
    storage.removeItem(oldKey);
  }
  function isMessages(value: unknown): value is PendingMessage[] {
    return Array.isArray(value) && value.every(isMessage);
  }
  function read(userId: string, coupleId: string): PendingMessage[] {
    migrate(userId);
    return readStored(key(userId, coupleId), isMessages, [], storage);
  }
  function write(userId: string, coupleId: string, messages: PendingMessage[]) {
    writeStored(key(userId, coupleId), messages, storage);
  }
  function update(userId: string, coupleId: string, id: string, change: Partial<PendingMessage> | null) {
    write(userId, coupleId, read(userId, coupleId).flatMap(message => message.id !== id ? [message] : change ? [{ ...message, ...change }] : []));
  }
  return { read, write, update };
}

export function permanentMessageError(error: { code?: string }): boolean {
  return error.code === '42501' || error.code === 'P0002' || /^(22|23)/.test(error.code ?? '');
}
