import { defineConfig } from 'vite';
import { resolve } from 'path';
import pkg from './package.json' with { type: 'json' };

const isDev = process.env.NODE_ENV !== 'production';

export default defineConfig({
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@types': resolve(__dirname, 'src/types'),
    },
  },
  define: {
    __ALPHA_TEST__: JSON.stringify(process.env.ALPHA_TEST === 'true'),
    __VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    __DEV_MODE__: JSON.stringify(isDev),
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
  base: '/heartbeat-life-game/',
});
