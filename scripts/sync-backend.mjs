import { readFileSync, writeFileSync } from 'node:fs';
const path = 'supabase/setup.sql';
const marker = '-- BEGIN GENERATED 20260908000100';
let base = readFileSync(path, 'utf8')
  .split(marker)[0]
  .replace(/commit;\s*$/i, '')
  .trimEnd();
const migrationNames = [
  '20260908000100_live_location_notifications.sql',
  '20260909000100_map_view_sessions.sql',
  '20260909000200_shared_activity_feed.sql',
  '20260909000300_trips_and_activity.sql',
  '20260911000100_place_sharing_privacy.sql',
  '20260911000200_shared_precision.sql',
  '20260911000300_media_foundation.sql',
  '20260912000100_daily_checkins.sql',
  '20260912000200_affection_kinds.sql',
  '20260912000300_checkin_status.sql',
  '20260915000100_daily_questions.sql',
  '20260915000200_custom_questions.sql',
  '20260915000300_question_preferences.sql',
  '20260921000100_plans_memories.sql',
  '20260921000200_checkin_memories.sql',
  '20260921000300_question_memories.sql',
  '20260921000400_memory_highlights.sql',
  '20261006000100_reliable_stories.sql',
];
const migrations = migrationNames.map(name => readFileSync(`supabase/migrations/${name}`, 'utf8')
  .replace(/^begin;\s*/, '').replace(/commit;\s*$/i, '').trimEnd());
const output = `${base}\n\n${marker}\n${migrations.join('\n\n')}\n\ncommit;\n`;
const upgradePath = 'docs/ACTUALIZACION_UBICACION.sql';
const upgrade = '-- Actualización sin borrar cuentas, mensajes ni lugares.\n-- Para instalaciones que ya tienen 20260908000100_live_location_notifications.\n-- Puede volver a ejecutarse si ya se aplicó total o parcialmente; no ejecutar setup.sql (reinicia los datos).\n-- Después, desplegar el worker push actualizado e instalar el nuevo binario.\n\nbegin;\n\n'+migrations.slice(1,4).join('\n\n')+'\n\ncommit;\n';
if (process.argv.includes('--check')) {
  if (readFileSync(path, 'utf8') !== output)
    throw new Error('Ejecuta node scripts/sync-backend.mjs');
  if (readFileSync(upgradePath,'utf8')!==upgrade) throw new Error('El SQL de actualización no está sincronizado.');
} else { writeFileSync(path, output); writeFileSync(upgradePath,upgrade); }
