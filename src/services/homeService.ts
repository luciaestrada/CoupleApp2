import type { Handlers, Message } from '../types/domain';
import { watchMessages } from './chatService';

// Shares the same query and Realtime channel as Chat; no second event store.
export function watchHomeActivity(coupleId: string, handlers: Handlers<Message[]>) {
  return watchMessages(coupleId, handlers);
}
