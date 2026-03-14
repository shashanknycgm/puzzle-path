const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Set the app root for expo-router before metro processes files
process.env.EXPO_ROUTER_APP_ROOT = path.join(__dirname, 'app');

const config = getDefaultConfig(__dirname);

module.exports = config;
