import { defineConfig } from 'vite';
import path from 'path';
import { balanceApiPlugin } from '../../shared/balance/devPlugin.mjs';

export default defineConfig({
  root: __dirname,
  cacheDir: path.resolve(__dirname, '../../node_modules/.vite-sim'),
  plugins: [balanceApiPlugin(path.resolve(__dirname, '../..'))],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../../shared'),
    },
  },
  server: {
    port: 5174,
  },
});
