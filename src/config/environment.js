const requiredEnvironment = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
};

for (const [name, value] of Object.entries(requiredEnvironment)) {
  if (!value) {
    throw new Error(`Configuración inválida: falta ${name}.`);
  }
}

let parsedSupabaseUrl;
try {
  parsedSupabaseUrl = new URL(requiredEnvironment.supabaseUrl);
} catch {
  throw new Error('Configuración inválida: EXPO_PUBLIC_SUPABASE_URL no es una URL válida.');
}

const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsedSupabaseUrl.hostname);
if (parsedSupabaseUrl.protocol !== 'https:' && !isLoopback) {
  throw new Error('Configuración inválida: Supabase debe usar HTTPS fuera de localhost.');
}

if (
  parsedSupabaseUrl.username ||
  parsedSupabaseUrl.password ||
  parsedSupabaseUrl.search ||
  parsedSupabaseUrl.hash ||
  !['', '/'].includes(parsedSupabaseUrl.pathname)
) {
  throw new Error('Configuración inválida: EXPO_PUBLIC_SUPABASE_URL debe ser la URL base.');
}

if (!requiredEnvironment.supabasePublishableKey.startsWith('sb_publishable_')) {
  throw new Error(
    'Configuración inválida: EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY debe ser una clave publicable.'
  );
}

export const environment = Object.freeze({
  supabaseUrl: parsedSupabaseUrl.toString().replace(/\/$/, ''),
  supabasePublishableKey: requiredEnvironment.supabasePublishableKey,
});
