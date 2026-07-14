const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { isYesterday, isSameDay, differenceInCalendarDays } = require('date-fns');

admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

async function sendPush(userId, title, body) {
  const userSnap = await db.doc(`users/${userId}`).get();
  const token = userSnap.data()?.expoPushToken;
  if (!token) return;
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: token, title, body }),
  });
}

// 1. Resetea rachas rotas cada madrugada (si nadie completó "amor mutuo" ayer)
exports.checkStreaks = onSchedule('every day 00:05', async () => {
  const couplesSnap = await db.collection('couples').get();
  const now = new Date();

  for (const coupleDoc of couplesSnap.docs) {
    const streak = coupleDoc.data().streak;
    if (!streak?.lastCompletedDate) continue;
    const lastCompleted = streak.lastCompletedDate.toDate();

    if (!isYesterday(lastCompleted) && !isSameDay(lastCompleted, now)) {
      await coupleDoc.ref.update({ 'streak.count': 0 });
    }
  }
});

// 2. Borra historias caducadas (>24h) cada hora
exports.expireStories = onSchedule('every 60 minutes', async () => {
  const now = admin.firestore.Timestamp.now();
  const couplesSnap = await db.collection('couples').get();

  for (const coupleDoc of couplesSnap.docs) {
    const storiesSnap = await coupleDoc.ref.collection('stories').where('expiresAt', '<=', now).get();
    const batch = db.batch();
    storiesSnap.forEach((s) => batch.delete(s.ref));
    if (!storiesSnap.empty) await batch.commit();
  }
});

// 3. Recordatorios de fechas especiales, cada día a las 09:00
exports.specialDateReminders = onSchedule('every day 09:00', async () => {
  const couplesSnap = await db.collection('couples').get();
  const today = new Date();

  for (const coupleDoc of couplesSnap.docs) {
    const datesSnap = await coupleDoc.ref.collection('specialDates').get();
    for (const dateDoc of datesSnap.docs) {
      const { title, date, notifyDaysBefore } = dateDoc.data();
      const target = date.toDate();
      target.setFullYear(today.getFullYear());
      const daysUntil = differenceInCalendarDays(target, today);

      if (daysUntil === (notifyDaysBefore ?? 3) || daysUntil === 0) {
        for (const memberId of coupleDoc.data().members) {
          await sendPush(
            memberId,
            daysUntil === 0 ? '¡Es hoy! 🎉' : 'Fecha especial próxima',
            daysUntil === 0 ? title : `${title} en ${daysUntil} días`
          );
        }
      }
    }
  }
});

// 4. Notifica a la pareja cuando alguien entra en un lugar guardado (geofence)
exports.onGeofenceEvent = onDocumentCreated('couples/{coupleId}/geofenceEvents/{eventId}', async (event) => {
  const { userId, placeName } = event.data.data();
  const coupleSnap = await db.doc(`couples/${event.params.coupleId}`).get();
  const otherUserId = coupleSnap.data().members.find((m) => m !== userId);
  if (!otherUserId) return;

  await sendPush(otherUserId, 'Tu pareja ha llegado', `Ha llegado a: ${placeName}`);
});
