import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure: (proxy) => proxy.on('error', (_, __, response) => {
          if (!response.headersSent) {
            response.writeHead(503, { 'Content-Type': 'application/json' })
            response.end(JSON.stringify({ error: 'Analysis API is unavailable. Start the Node server with npm run dev and retry.' }))
          }
        }),
      },
    },
  },
})
