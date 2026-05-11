import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router'))
            return 'vendor-react'
          if (id.includes('node_modules/@supabase'))
            return 'vendor-supabase'
          if (id.includes('node_modules/recharts'))
            return 'vendor-charts'
          if (id.includes('node_modules/jspdf') || id.includes('node_modules/qrcode'))
            return 'vendor-pdf'
        },
      },
    },
  },
})
