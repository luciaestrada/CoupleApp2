const CHANNEL_SEQUENCE_KEY = '__coupleAppRealtimeChannelSequence';

function nextChannelSequence() {
  const current = globalThis[CHANNEL_SEQUENCE_KEY];
  const next = Number.isSafeInteger(current) && current < Number.MAX_SAFE_INTEGER ? current + 1 : 1;
  globalThis[CHANNEL_SEQUENCE_KEY] = next;
  return next;
}

export function uniqueRealtimeChannelName(baseName) {
  if (typeof baseName !== 'string' || !baseName.trim()) {
    throw new TypeError('El nombre base del canal Realtime no puede estar vacío.');
  }

  // realtime-js devuelve el canal existente cuando el nombre coincide. Un sufijo por instancia
  // permite watchers simultáneos y evita reutilizar un canal mientras removeChannel() termina.
  return `${baseName}-${Date.now().toString(36)}-${nextChannelSequence().toString(36)}`;
}

export function createRealtimeChannel(client, baseName) {
  if (!client || typeof client.channel !== 'function') {
    throw new TypeError('Se necesita un cliente Realtime válido.');
  }
  return client.channel(uniqueRealtimeChannelName(baseName));
}
