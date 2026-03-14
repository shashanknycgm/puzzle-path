const path = require('path');

// Must be set before babel runs so transform-inline-environment-variables can substitute it
process.env.EXPO_ROUTER_APP_ROOT = path.join(__dirname, 'app');

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['transform-inline-environment-variables', {
        include: ['EXPO_ROUTER_APP_ROOT', 'EXPO_ROUTER_IMPORT_MODE'],
      }],
      'react-native-reanimated/plugin',
    ],
  };
};
