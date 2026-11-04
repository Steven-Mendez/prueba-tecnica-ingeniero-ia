import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // En desarrollo, las llamadas a /api las atiende `fastapi dev` (puerto 8000).
    // En producción no hace falta: FastAPI sirve la API y el frontend desde el mismo origen.
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
