import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiPort = process.env.PORT || '3001'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
        configure: (proxy) => proxy.on('error', (_, __, response) => {
          if (response && !response.headersSent) {
            response.writeHead(503, { 'Content-Type': 'application/json' })
            response.end(JSON.stringify({ error: 'Analysis API is unavailable. Start the Node server with npm run dev and retry.' }))
          }
        }),
      },
    },
  },
})
