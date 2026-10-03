import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Em desenvolvimento, `vercel dev` serve /api; com `vite` puro, aponte para ele.
    proxy: process.env.API_PROXY ? { '/api': process.env.API_PROXY } : undefined,
  },
});
