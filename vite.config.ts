import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';
import {gaiaDashboardApiPlugin} from './server/plugin';

export default defineConfig({
  plugins: [tailwindcss(), react(), gaiaDashboardApiPlugin()],
  resolve: {
    alias: {
      '~': new URL('app', import.meta.url).pathname,
    },
  },
});
