import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3010,
    proxy: {
      '/s/': 'http://localhost:8081/s/',
      '/api': 'http://localhost:8081',
    },
  },
  define: { 'process.env': {} },
  resolve: {
    alias: {
      // Point to common source so Vite does not hit package exports
      'citadels-common': path.resolve(__dirname, '../common/src/index.ts'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
