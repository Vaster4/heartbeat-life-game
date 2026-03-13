import { defineConfig } from 'vite';
import { resolve } from 'path';

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
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
  base: '/heartbeat-life-game/',
});
