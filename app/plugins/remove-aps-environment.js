const { withEntitlementsPlist } = require('@expo/config-plugins');

// expo-notifications auto-plugin adds aps-environment: development to entitlements.
// This app uses only local notifications and the provisioning profile doesn't include
// aps-environment, so we remove it here to prevent a build mismatch.
module.exports = function withRemoveApsEnvironment(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults['aps-environment'];
    return config;
  });
};
