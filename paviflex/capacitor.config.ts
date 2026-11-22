import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'co.calvache.paviflex',
  appName: 'PaviFlex',
  webDir: 'dist',
  android: {
    // La app guarda fotografías y genera informes grandes en el WebView
    allowMixedContent: false,
  },
  plugins: {
    CapacitorHttp: { enabled: false },
  },
};

export default config;
