import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ru.vibe.netmap',
  appName: 'NetMap Planner',
  webDir: 'dist',
  android: {
    backgroundColor: '#0f1419',
    allowMixedContent: false,
  },
};

export default config;
