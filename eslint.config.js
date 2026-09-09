// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'dist/**',
      '.deno-cache/**',
      '.npm-cache/**',
      '.expo*/**',
      'android/**',
      'supabase/functions/**',
    ],
  },
]);
