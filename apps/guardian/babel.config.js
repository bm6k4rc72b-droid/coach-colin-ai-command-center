module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Vision Camera frame processors compile through the worklets plugin.
      // Reanimated's plugin must stay last — it rewrites everything above it.
      ['react-native-worklets-core/plugin'],
      'react-native-reanimated/plugin',
    ],
  };
};
