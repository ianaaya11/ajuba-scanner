import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ajuba.scanner',
  appName: 'ajuba scanner',
  webDir: 'dist',
  android: {
    // The scanner is portrait-first and the WebView keeps its own background.
    backgroundColor: '#0a0c1a',
  },
};

export default config;
