import path from 'path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/s/': 'http://localhost:8081/s/',
      '/api': 'http://localhost:8081',
    },
  },
  define: { 'process.env': {} },
  resolve: {
    alias: {
      vue: 'vue/dist/vue.esm-bundler.js',
      // Point to common source so Vite does not hit package exports
      'citadels-common': path.resolve(__dirname, '../common/src/index.ts'),
    },
  },
});
