import { doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { isSameDay, isYesterday } from 'date-fns';

/**
 * Envía "amor" del día. Incrementa la racha si el otro miembro
 * también envió hoy o ayer se completó la racha; si se rompe, resetea.
 */
export async function sendLove(coupleId, userId, couple) {
  const coupleRef = doc(db, 'couples', coupleId);
  const isA = couple.members[0] === userId;
  const otherSentField = isA ? 'lastSentByB' : 'lastSentByA';
  const mySentField = isA ? 'lastSentByA' : 'lastSentByB';

  const now = new Date();
  const otherLastSent = couple.streak?.[otherSentField]?.toDate?.();
  const lastCompleted = couple.streak?.lastCompletedDate?.toDate?.();

  let newCount = couple.streak?.count || 0;

  // Si el otro ya envió amor hoy, se completa el día y sube la racha
  if (otherLastSent && isSameDay(otherLastSent, now)) {
    const streakContinues = !lastCompleted || isYesterday(lastCompleted) || isSameDay(lastCompleted, now);
    newCount = streakContinues ? newCount + 1 : 1;

    await updateDoc(coupleRef, {
      [`streak.${mySentField}`]: serverTimestamp(),
      'streak.count': newCount,
      'streak.lastCompletedDate': serverTimestamp(),
    });
  } else {
    // Solo yo he enviado hoy, se espera al otro
    await updateDoc(coupleRef, {
      [`streak.${mySentField}`]: serverTimestamp(),
    });
  }

  await addDoc(collection(db, 'couples', coupleId, 'messages'), {
    senderId: userId,
    type: 'love',
    text: '❤️',
    createdAt: serverTimestamp(),
  });
}
