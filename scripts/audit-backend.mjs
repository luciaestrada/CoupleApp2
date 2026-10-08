import { readFileSync } from 'node:fs';

// Read-only checks. Never sends credentials to a different origin.
const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).flatMap(line => {
  const match = line.match(/^([A-Z_]+)\s*=\s*(.*)$/);
  return match ? [[match[1], match[2].replace(/^(['"])(.*)\1$/, '$2')]] : [];
}));
const base = new URL(env.EXPO_PUBLIC_SUPABASE_URL);
const headers = { apikey: env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY };
for (const path of ['/auth/v1/health', '/rest/v1/', '/functions/v1/push', '/functions/v1/maintenance']) {
  try {
    const response = await fetch(new URL(path, base), { headers, redirect: 'error', signal: AbortSignal.timeout(15000) });
    const body = await response.text();
    console.log(`${path}: HTTP ${response.status}`);
    if (!response.ok) {
      try {
        const payload = JSON.parse(body);
        const detail = [payload.code, payload.msg ?? payload.message].filter(value => typeof value === 'string').join(': ');
        console.log(detail.replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, '[redacted]').slice(0, 700));
      } catch { console.log('Respuesta de error sin JSON.'); }
    }
    if (path.startsWith('/functions/') && ![401, 403, 405].includes(response.status)) process.exitCode = 1;
    if (path === '/auth/v1/health' && !response.ok) process.exitCode = 1;
  } catch (error) {
    console.log(`${path}: ${error.message}; ${error.cause?.code ?? ''}`);
    process.exitCode = 1;
  }
}
