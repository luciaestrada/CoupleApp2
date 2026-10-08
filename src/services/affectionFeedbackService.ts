import { AppState, Platform } from 'react-native';
import { watchMessages } from './chatService';
import { createFeedbackGate } from '../features/affection/feedbackGate';

const listeners = new Map();
let currentContext = null;
export function getAffectionFeedback(userId) {
  try {
    const value = JSON.parse(localStorage.getItem(`coupleapp.feedback.${userId}`) ?? '{}');
    return { send: value.send === true, receive: value.receive === true };
  } catch { return { send: false, receive: false }; }
}
export function setAffectionFeedback(userId, changes) {
  const value = { ...getAffectionFeedback(userId), ...changes };
  localStorage.setItem(`coupleapp.feedback.${userId}`, JSON.stringify(value));
  listeners.get(userId)?.forEach(listener => listener(value));
}
export function watchAffectionFeedback(userId, listener) {
  if (!listeners.has(userId)) listeners.set(userId, new Set());
  listeners.get(userId).add(listener);
  listener(getAffectionFeedback(userId));
  return () => {
    const group = listeners.get(userId);
    group?.delete(listener);
    if (!group?.size) listeners.delete(userId);
  };
}
async function pulse(stillAllowed) {
  if (AppState.currentState !== 'active' || !stillAllowed()) return;
  try {
    // An older installed client may not contain this native module yet.
    const Haptics = await import('expo-haptics');
    if (AppState.currentState !== 'active' || !stillAllowed()) return;
    if (Platform.OS === 'android') await Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm);
    else if (Platform.OS === 'ios') await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch { /* Haptics never change whether a gesture was delivered. */ }
}
export function feedbackForSentGesture(userId, coupleId) {
  const context = currentContext;
  return pulse(() => context && currentContext === context && context.userId === userId && context.coupleId === coupleId && getAffectionFeedback(userId).send);
}
export function startAffectionFeedback(coupleId, userId) {
  const context = { coupleId, userId };
  currentContext = context;
  let stopMessages, alive = true;
  let previousReceive, preferenceRevision = 0;
  const gate = createFeedbackGate({ storage: localStorage, key: `coupleapp.feedback.seen.${userId}.${coupleId}`, userId });
  const app = AppState.addEventListener('change', () => gate.reset());
  const stopPreferences = watchAffectionFeedback(userId, preferences => {
    if (previousReceive === preferences.receive) return;
    previousReceive = preferences.receive;
    const revision = ++preferenceRevision;
    stopMessages?.();
    stopMessages = null;
    gate.reset();
    if (!preferences.receive) return;
    stopMessages = watchMessages(coupleId, {
      onData: messages => {
        if (!alive || AppState.currentState !== 'active') return;
        try {
          if (gate.accept(messages)) void pulse(() => alive && revision === preferenceRevision && getAffectionFeedback(userId).receive);
        } catch { /* Storage failure must not interfere with chat. */ }
      },
      onError: () => gate.reset(),
    });
  });
  return () => {
    alive = false;
    if (currentContext === context) currentContext = null;
    stopPreferences();stopMessages?.();app.remove();
  };
}
