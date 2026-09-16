import { todayInMadrid } from '../../utils/dateUtils.js';

const labels = {
  enter: 'Una llegada compartida', exit: 'Una salida compartida',
  trip: 'Un recorrido compartido', story: 'Una historia compartida',
  activity: 'Actividad compartida', battery: 'Información de batería', question: 'Pregunta del día respondida',
};
const gestures = { love: 'Amor', kiss: 'Un beso', hug: 'Un abrazo', miss_you: 'Te echo de menos' };

export function activityLabel(message) {
  if (message.type === 'love') return gestures[message.metadata?.affection] ?? gestures.love;
  if (message.type === 'event') return labels[message.metadata?.kind] ?? 'Un momento compartido';
  return 'Un mensaje';
}

export function todayActivity(messages, now, limit = 5) {
  const day = todayInMadrid(new Date(now));
  const seen = new Set();
  return messages.filter(message => {
    const date = Date.parse(message.createdAt);
    if (seen.has(message.id) || !Number.isFinite(date) || date > now || todayInMadrid(new Date(date)) !== day) return false;
    seen.add(message.id);
    return true;
  }).sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).slice(0,limit);
}
