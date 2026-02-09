import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/sc-api': {
        target: 'https://api-v2.soundcloud.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sc-api/, ''),
        headers: {
          'Origin': 'https://soundcloud.com',
          'Referer': 'https://soundcloud.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
      }
    }
  }
})
