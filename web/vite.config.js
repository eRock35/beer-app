import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In dev the API runs separately; proxying keeps cookies same-origin.
    proxy: {
      '/api': {
        target: process.env.API_ORIGIN || 'http://localhost:8080',
        changeOrigin: true,
      },
      // Share pages and cards are drawn by the server, not the SPA.
      '^/p/': { target: process.env.API_ORIGIN || 'http://localhost:8080' },
      '^/c/[^/]+\\.png$': { target: process.env.API_ORIGIN || 'http://localhost:8080' },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          // Leaflet is ~150 KB and only the map view needs it.
          leaflet: ['leaflet'],
        },
      },
    },
  },
});
