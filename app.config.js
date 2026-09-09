const { expo } = require('./app.json');
const { existsSync } = require('node:fs');
const googleServicesFile =
  process.env.GOOGLE_SERVICES_JSON ||
  (existsSync('./android/app/google-services.json')
    ? './android/app/google-services.json'
    : undefined);

module.exports = () => ({
  ...expo,
  extra: {
    ...expo.extra,
    androidMapsConfigured: Boolean(process.env.GOOGLE_MAPS_ANDROID_API_KEY),
  },
  android: {
    ...expo.android,
    allowBackup: false,
    ...(process.env.GOOGLE_MAPS_ANDROID_API_KEY
      ? {
          config: {
            googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY },
          },
        }
      : {}),
    ...(googleServicesFile ? { googleServicesFile } : {}),
  },
});
