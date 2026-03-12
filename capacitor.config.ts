import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.heartbeatlife.game',
  appName: '心动的生活',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
