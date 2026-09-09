import { readFileSync, writeFileSync } from 'node:fs';
const path = 'supabase/setup.sql';
const marker = '-- BEGIN GENERATED 20260908000100';
let base = readFileSync(path, 'utf8')
  .split(marker)[0]
  .replace(/commit;\s*$/i, '')
  .trimEnd();
const migration = readFileSync(
  'supabase/migrations/20260908000100_live_location_notifications.sql',
  'utf8',
).replace(/^begin;\s*/, '');
const output = `${base}\n\n${marker}\n${migration}`;
if (process.argv.includes('--check')) {
  if (readFileSync(path, 'utf8') !== output)
    throw new Error('Ejecuta node scripts/sync-backend.mjs');
} else writeFileSync(path, output);
