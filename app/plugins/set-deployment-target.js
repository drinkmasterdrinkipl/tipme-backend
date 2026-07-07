const { withXcodeProject } = require('@expo/config-plugins');

module.exports = function withDeploymentTarget(config, { version = '18.0' } = {}) {
  return withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const configurations = xcodeProject.pbxXCBuildConfigurationSection();

    for (const key of Object.keys(configurations)) {
      const buildConfig = configurations[key];
      if (buildConfig && typeof buildConfig === 'object' && buildConfig.buildSettings) {
        buildConfig.buildSettings['IPHONEOS_DEPLOYMENT_TARGET'] = version;
      }
    }

    return config;
  });
};
