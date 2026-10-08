import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const root = process.cwd();

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function fail(message) {
  throw new Error(`Arquitectura inválida: ${message}`);
}

function requireText(text, pattern, message) {
  const found =
    pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern);
  if (!found) fail(message);
}

const supabaseDirectory = join(root, 'supabase');
const sqlFiles = walk(supabaseDirectory).filter(
  (file) => extname(file) === '.sql',
);
const setupPath = join(root, 'supabase', 'setup.sql');
const unexpectedSqlFiles = sqlFiles.filter((file) => {
  const path = relative(root, file).replaceAll('\\', '/');
  return (
    path !== 'supabase/setup.sql' &&
    !/^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(path)
  );
});
if (!sqlFiles.includes(setupPath) || unexpectedSqlFiles.length > 0) {
  fail(
    'debe existir setup.sql y cualquier actualización debe vivir en supabase/migrations.',
  );
}

const setupSql = readFileSync(setupPath, 'utf8');
const sourceFiles = walk(join(root, 'src')).filter((file) =>
  /\.(js|jsx|ts|tsx)$/.test(file),
);
const source = sourceFiles.map((file) => readFileSync(file, 'utf8')).join('\n');
const edgeFunctionFiles = walk(join(root, 'supabase', 'functions')).filter(
  (file) => /\.(js|ts)$/.test(file),
);
const runtimeSource = [...sourceFiles, ...edgeFunctionFiles]
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');

for (const match of runtimeSource.matchAll(/\.rpc\(\s*['"]([a-z0-9_]+)['"]/g)) {
  const rpcName = match[1];
  if (
    !new RegExp(`create (?:or replace )?function public\\.${rpcName}\\(`).test(
      setupSql,
    )
  ) {
    fail(`la RPC ${rpcName} usada por la app no existe en setup.sql.`);
  }
}

const clientRpcNames = new Set(
  [...source.matchAll(/\.rpc\(\s*['"]([a-z0-9_]+)['"]/g)].map(
    (match) => match[1],
  ),
);
for (const rpcName of clientRpcNames) {
  requireText(
    setupSql,
    new RegExp(
      `revoke all on function public\\.${rpcName}\\([^)]*\\) from public;`,
    ),
    `la RPC cliente ${rpcName} debe revocar ejecución a public.`,
  );
  requireText(
    setupSql,
    new RegExp(
      `grant execute on function public\\.${rpcName}\\([^)]*\\) to authenticated;`,
    ),
    `la RPC cliente ${rpcName} debe concederse a authenticated.`,
  );
}

for (const match of runtimeSource.matchAll(
  /\.from\(\s*['"]([a-z0-9_]+)['"]\)/g,
)) {
  const tableName = match[1];
  if (['stories', 'avatars'].includes(tableName)) continue;
  if (!new RegExp(`create table (?:if not exists )?public\\.${tableName}\\s*\\(`, 'i').test(setupSql)) {
    fail(`la tabla ${tableName} usada por la app no existe en setup.sql.`);
  }
}

for (const screen of walk(join(root, 'src', 'screens'))) {
  if (readFileSync(screen, 'utf8').includes('supabase/client')) {
    fail(`${relative(root, screen)} accede directamente al cliente Supabase.`);
  }
}

for (const match of setupSql.matchAll(
  /create table public\.([a-z0-9_]+) \(/g,
)) {
  const tableName = match[1];
  requireText(
    setupSql,
    `alter table public.${tableName} enable row level security;`,
    `la tabla ${tableName} debe habilitar RLS.`,
  );
}

for (const match of setupSql.matchAll(
  /create function public\.([a-z0-9_]+)\([\s\S]*?\n\$\$;/g,
)) {
  const functionSql = match[0];
  if (
    functionSql.includes('security definer') &&
    !functionSql.includes('set search_path =')
  ) {
    fail(`la función security definer ${match[1]} debe fijar search_path.`);
  }
}

const forbiddenPatterns = [
  ['SUPABASE_ANON_KEY', 'clave anon heredada'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'clave service_role heredada'],
  ["from 'firebase/", 'dependencia Firebase'],
  ['create_couple_with_invite', 'RPC de reparación antigua'],
  ['join_couple_by_code', 'RPC de reparación antigua'],
];

for (const [pattern, label] of forbiddenPatterns) {
  if (runtimeSource.includes(pattern)) fail(`se encontró ${label}.`);
}

const maintenanceFunction = readFileSync(
  join(root, 'supabase', 'functions', 'maintenance', 'index.ts'),
  'utf8',
);
if (
  !/withSupabase(?:<Database>)?\(\s*\{\s*auth:\s*'secret'\s*\}/.test(
    maintenanceFunction,
  )
) {
  fail('maintenance debe exigir autenticación con clave secreta.');
}
requireText(
  maintenanceFunction,
  "request.method !== 'POST'",
  'maintenance solo debe ejecutar efectos mediante POST.',
);

const supabaseConfig = readFileSync(
  join(root, 'supabase', 'config.toml'),
  'utf8',
);
if (
  !/^\[functions\.maintenance\]\s*\r?\nverify_jwt\s*=\s*false\s*$/m.test(
    supabaseConfig,
  )
) {
  fail('maintenance debe desactivar verify_jwt para aceptar la clave secreta.');
}

const appNavigator = readFileSync(
  join(root, 'src', 'navigation', 'AppNavigator.tsx'),
  'utf8',
);
requireText(
  appNavigator,
  'name="Cuenta"',
  'la app emparejada debe ofrecer acceso a Cuenta.',
);

const realtimeService = readFileSync(
  join(root, 'src', 'services', 'realtimeService.ts'),
  'utf8',
);
const coupleService = readFileSync(
  join(root, 'src', 'services', 'coupleService.ts'),
  'utf8',
);
requireText(
  realtimeService,
  'createRealtimeChannel(supabase, channelName)',
  'los watchers compartidos deben crear una instancia de canal única.',
);
requireText(
  coupleService,
  'watchQuery(',
  'el watcher de pareja debe compartir el ciclo de vida Realtime.',
);

const chatScreen = readFileSync(
  join(root, 'src', 'screens', 'ChatScreen.tsx'),
  'utf8',
);
requireText(
  chatScreen,
  /<FlatList[\s\S]*?\binverted\b/,
  'el chat debe abrir por el mensaje reciente.',
);

const couplesTableSql = setupSql.match(
  /create table public\.couples \([\s\S]*?\n\);/,
)?.[0];
const membersTableSql = setupSql.match(
  /create table public\.couple_members \([\s\S]*?\n\);/,
)?.[0];
if (!couplesTableSql || !membersTableSql)
  fail('faltan las tablas de pareja o miembros.');
if (/streak_count|last_love_date/.test(couplesTableSql)) {
  fail('la racha no puede pertenecer a la pareja compartida.');
}
requireText(
  membersTableSql,
  'love_streak_count integer not null default 0',
  'cada miembro debe tener su propio contador de racha.',
);
requireText(
  membersTableSql,
  'last_love_date date',
  'cada miembro debe conservar su propia fecha de amor.',
);
const sendLoveSql = setupSql.match(
  /create function public\.send_love\(p_couple_id uuid\)[\s\S]*?\n\$\$;/,
)?.[0];
if (!sendLoveSql) fail('falta la implementación de send_love.');
requireText(
  sendLoveSql,
  /update public\.couple_members[\s\S]*?user_id = auth\.uid\(\)/,
  'send_love debe actualizar exclusivamente la racha del usuario autenticado.',
);
if (sendLoveSql.includes('update public.couples')) {
  fail('send_love no debe actualizar una racha compartida en couples.');
}
const personalStreakMigration = readFileSync(
  join(
    root,
    'supabase',
    'migrations',
    '20260813000100_personal_love_streaks.sql',
  ),
  'utf8',
);
requireText(
  personalStreakMigration,
  'set love_streak_count = couple.streak_count',
  'la migración debe conservar la racha compartida existente.',
);
requireText(
  personalStreakMigration,
  'drop column if exists streak_count',
  'la migración debe retirar el contador compartido anterior.',
);
if (
  personalStreakMigration.indexOf(
    'create or replace function public.send_love',
  ) > personalStreakMigration.indexOf('drop column if exists streak_count')
) {
  fail(
    'la migración debe reemplazar las funciones antes de retirar sus columnas antiguas.',
  );
}
const streakService = readFileSync(
  join(root, 'src', 'services', 'streakService.ts'),
  'utf8',
);
requireText(
  streakService,
  "table: 'couple_members'",
  'el cliente debe observar las rachas independientes de couple_members.',
);

const permissionServicePath = join(
  root,
  'src',
  'services',
  'permissionService.ts',
);
for (const file of sourceFiles) {
  if (file === permissionServicePath) continue;
  const fileSource = readFileSync(file, 'utf8');
  if (
    /(?:Notifications|Location|ImagePicker)\.request(?:Foreground|Background|MediaLibrary)?PermissionsAsync\(/.test(
      fileSource,
    )
  ) {
    fail(
      `${relative(root, file)} solicita permisos fuera del servicio centralizado.`,
    );
  }
}
const settingsScreen = readFileSync(
  join(root, 'src', 'screens', 'SettingsScreen.tsx'),
  'utf8',
);
requireText(
  settingsScreen,
  'getPermissionSnapshot',
  'Ajustes debe mostrar el estado de los permisos.',
);
requireText(
  settingsScreen,
  'showPermissionSettingsAlert',
  'Ajustes debe permitir reparar permisos bloqueados desde Ajustes.',
);
requireText(
  settingsScreen,
  'location.foreground',
  'Ajustes debe detectar si el permiso permanente falla por el permiso de primer plano.',
);
const appConfig = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8'));
const locationPlugin = appConfig.expo.plugins.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-location',
);
if (
  !locationPlugin ||
  locationPlugin[1]?.isAndroidForegroundServiceEnabled !== true
) {
  fail(
    'el seguimiento debe declarar un servicio Android de ubicación visible.',
  );
}
if (!appConfig.expo.plugins.includes('expo-background-task') ||
    !appConfig.expo.plugins.includes('./plugins/withLocalIosNotifications') ||
    !appConfig.expo.ios?.infoPlist?.UIBackgroundModes?.includes('location') ||
    appConfig.expo.ios?.infoPlist?.UIBackgroundModes?.includes('remote-notification'))
  fail('iOS debe declarar ubicación y tareas de fondo sin depender de APNs.');
requireText(readFileSync(join(root,'src/services/backgroundNotificationService.ts'),'utf8'),
  'syncTrackingConfig', 'La tarea de fondo iOS debe revalidar también las solicitudes del mapa.');
requireText(readFileSync(join(root,'src/features/location/trackingWake.ts'),'utf8'),
  'syncTrackingConfig', 'Los avisos de control deben revalidar la sesión en el servidor.');

const specialDatesScreen = readFileSync(
  join(root, 'src', 'screens', 'SpecialDatesScreen.tsx'),
  'utf8',
);
requireText(
  specialDatesScreen,
  'notifyDaysInput',
  'la interfaz de fechas debe permitir configurar la antelación.',
);
requireText(
  specialDatesScreen,
  'setRecurring',
  'la interfaz de fechas debe permitir configurar la recurrencia.',
);
requireText(
  specialDatesScreen,
  'deleteSpecialDate',
  'la interfaz de fechas debe permitir eliminar una fecha.',
);

const statusScreen = readFileSync(
  join(root, 'src', 'screens', 'StatusScreen.tsx'),
  'utf8',
);
requireText(
  statusScreen,
  'CheckinCard',
  'el estado debe compartir el editor de check-in.',
);
requireText(readFileSync(join(root, 'src', 'ui', 'CheckinCard.tsx'), 'utf8'),
  'clearCheckin', 'la interfaz debe permitir retirar el check-in propio.');

const geofenceScreen = readFileSync(
  join(root, 'src', 'screens', 'GeofenceSetupScreen.tsx'),
  'utf8',
);
requireText(
  geofenceScreen,
  'deleteGeofence',
  'la interfaz debe permitir eliminar un geofence.',
);

const appEntry = readFileSync(join(root, 'App.tsx'), 'utf8');
requireText(
  appEntry,
  'startGeofenceSync',
  'los geofences deben sincronizarse durante el arranque emparejado.',
);
requireText(
  setupSql,
  /select count\(\*\)[\s\S]*?from public\.geofences[\s\S]*?\) >= 20 then/,
  'SQL debe imponer el límite de geofences.',
);
requireText(
  setupSql,
  "event.created_at > now() - interval '15 minutes'",
  'SQL debe evitar eventos de geofence repetidos en una ventana corta.',
);
requireText(
  setupSql,
  /story_files_insert_member[\s\S]*?name ~ '\^\[0-9a-f-\]\{36\}\//,
  'Storage debe restringir el formato completo de las rutas de historias.',
);

const functionalityDoc = join(root, 'docs', 'FUNCTIONALITY.md');
if (!statSync(functionalityDoc).isFile()) fail('falta docs/FUNCTIONALITY.md.');

console.log(
  'Arquitectura verificada: contrato único Supabase y pantallas desacopladas.',
);
