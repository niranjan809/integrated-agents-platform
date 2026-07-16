import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    port: 5173,
    strictPort: true, // fail fast if 5173 is taken instead of drifting to 5174 (origin-scoped session would break)
    // Dev proxy — only used locally, Vercel uses VITE_BACKEND_URL directly
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
