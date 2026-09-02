import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

// The built app is served by the Express server in ../server.js, which prefers
// web/dist when it exists and otherwise falls back to the dependency-free
// public/ client. `npm run dev` proxies /api to that same server.
export default defineConfig({
  plugins: [react(), tailwind()],
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 900 },
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.API_ORIGIN || 'http://localhost:3000', changeOrigin: true } }
  }
});
