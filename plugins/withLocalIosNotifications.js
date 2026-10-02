const { withEntitlementsPlist, withInfoPlist } = require('expo/config-plugins');

// Register before expo-notifications: Expo evaluates these mod actions in reverse
// order, so this removes the entitlement after the notifications plugin adds it.
module.exports = function withLocalIosNotifications(config) {
  config = withEntitlementsPlist(config, (mod) => {
    delete mod.modResults['aps-environment'];
    return mod;
  });
  return withInfoPlist(config, (mod) => {
    if (Array.isArray(mod.modResults.UIBackgroundModes)) {
      mod.modResults.UIBackgroundModes = mod.modResults.UIBackgroundModes
        .filter((mode) => mode !== 'remote-notification');
    }
    return mod;
  });
};
