import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` makes the production build relocatable: it works when served from
// a sub-path (GitHub Pages, a static host, or a folder opened through any static
// file server) because all asset URLs are relative.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          jsonata: ['jsonata'],
        },
      },
    },
  },
});
