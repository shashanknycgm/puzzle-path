const path = require('path');

// Compute the relative path from expo-router's root to our app/ folder.
// _ctx.ios.js is at node_modules/expo-router/_ctx.ios.js, so we need the
// relative path from node_modules/expo-router/ to our app/ directory.
const expoRouterRoot = path.dirname(require.resolve('expo-router/package.json'));
const appDir = path.join(__dirname, 'app');
const relativeAppRoot = path.relative(expoRouterRoot, appDir);

process.env.EXPO_ROUTER_APP_ROOT = relativeAppRoot;

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
