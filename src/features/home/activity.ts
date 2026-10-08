import { todayInMadrid } from '../../utils/dateUtils';
import type { Message } from '../../types/domain';

const labels: Record<string, string> = {
  enter: 'Una llegada compartida', exit: 'Una salida compartida',
  trip: 'Un recorrido compartido', story: 'Una historia compartida',
  activity: 'Actividad compartida', battery: 'Información de batería', question: 'Pregunta del día respondida',
};
const gestures: Record<string, string> = { love: 'Amor', kiss: 'Un beso', hug: 'Un abrazo', miss_you: 'Te echo de menos' };

export function activityLabel(message: Message) {
  if (message.type === 'love') return gestures[String(message.metadata?.affection)] ?? gestures.love;
  if (message.type === 'event') return labels[String(message.metadata?.kind)] ?? 'Un momento compartido';
  return 'Un mensaje';
}

export function todayActivity(messages: Message[], now: number, limit = 5) {
  const day = todayInMadrid(new Date(now));
  const seen = new Set();
  return messages.filter(message => {
    const date = Date.parse(message.createdAt);
    if (seen.has(message.id) || !Number.isFinite(date) || date > now || todayInMadrid(new Date(date)) !== day) return false;
    seen.add(message.id);
    return true;
  }).sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).slice(0,limit);
}
