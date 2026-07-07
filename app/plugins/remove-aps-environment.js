const { withEntitlementsPlist } = require('@expo/config-plugins');

// expo-notifications auto-plugin adds aps-environment: development to entitlements.
// This app uses only local notifications and the provisioning profile doesn't include
// aps-environment, so we remove it here to prevent a build mismatch.
module.exports = function withRemoveApsEnvironment(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults['aps-environment'];
    // Required for Tap to Pay on iPhone — entitlement must be present in the compiled app
    // (App ID capability alone is not sufficient; prebuild regenerates entitlements from plugins)
    config.modResults['com.apple.developer.proximity-reader.payment.acceptance'] = true;
    return config;
  });
};
