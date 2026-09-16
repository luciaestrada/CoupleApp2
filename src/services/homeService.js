import { watchMessages } from './chatService';

// Shares the same query and Realtime channel as Chat; no second event store.
export function watchHomeActivity(coupleId, handlers) {
  return watchMessages(coupleId, handlers);
}
