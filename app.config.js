const isDevelopment = process.env.APP_VARIANT === 'development';

const productionIdentifier = 'com.chessperfect.mobile';
const developmentIdentifier = `${productionIdentifier}.dev`;

module.exports = ({ config }) => {
  const plugins = (config.plugins ?? []).filter((plugin) => {
    const pluginName = Array.isArray(plugin) ? plugin[0] : plugin;
    return pluginName !== 'expo-dev-client';
  });

  return {
    ...config,
    name: isDevelopment ? 'ChessPerfect Dev' : 'ChessPerfect',
    scheme: isDevelopment ? 'chessperfect-dev' : 'chessperfect',
    android: {
      ...config.android,
      package: isDevelopment ? developmentIdentifier : productionIdentifier,
    },
    ios: {
      ...config.ios,
      bundleIdentifier: isDevelopment ? developmentIdentifier : productionIdentifier,
    },
    plugins: [
      ...plugins,
      [
        'expo-dev-client',
        {
          addGeneratedScheme: isDevelopment,
        },
      ],
    ],
  };
};
