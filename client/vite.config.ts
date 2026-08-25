import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
      '/radio': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/hls/': {
        target: 'http://localhost:8888',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/hls/, ''),
      },
    },
  },
})
