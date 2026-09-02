import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// npm run dev serves the UI on 5173 and forwards /api to the Express backend,
// so both halves run side by side while developing.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } }
  },
  build: { outDir: 'dist' }
});
