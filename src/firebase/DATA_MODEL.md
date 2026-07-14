# Modelo de datos Firestore

```
users/{userId}
  - name
  - avatarUrl
  - coupleId
  - expoPushToken
  - status: { text, emoji, updatedAt }

couples/{coupleId}
  - members: [uidA, uidB]
  - startDate: timestamp        // para el contador de días juntos
  - streak: { count, lastSentByA, lastSentByB, lastCompletedDate }

  couples/{coupleId}/messages/{messageId}
    - senderId
    - text
    - type: "text" | "love"     // "love" incrementa la racha
    - createdAt

  couples/{coupleId}/stories/{storyId}
    - authorId
    - imageUrl
    - createdAt
    - expiresAt                 // ahora() + 24h, borrado por Cloud Function

  couples/{coupleId}/specialDates/{dateId}
    - title                     // "Cumpleaños de X", "Aniversario"
    - date
    - recurring: boolean
    - notifyDaysBefore: number

  couples/{coupleId}/locations/{userId}
    - lat, lng
    - updatedAt

  couples/{coupleId}/geofences/{userId}
    - name                      // "Casa", "Trabajo"
    - lat, lng
    - radiusMeters
```
