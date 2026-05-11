import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Post-processes built HTML to strip eager modulepreload for lazy-only chunks
// and convert the CSS link from render-blocking to async.
// resolveDependencies is unreliable in Vite 8/rolldown, so we edit HTML directly.
function optimizeHtmlPlugin() {
  return {
    name: 'optimize-html',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html
          // Remove modulepreload for chunks only needed on specific routes
          .replace(/<link rel="modulepreload" crossorigin href="\/assets\/vendor-(pdf|charts)-[^"]*\.js">\n?/g, '')
          // Make the app CSS non-render-blocking so inline loading state paints immediately
          .replace(
            /<link rel="stylesheet" crossorigin href="(\/assets\/[^"]+\.css)">/g,
            (_, href) =>
              `<link rel="preload" as="style" href="${href}" onload="this.onload=null;this.rel='stylesheet'">` +
              `<noscript><link rel="stylesheet" href="${href}"></noscript>`
          )
      },
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    optimizeHtmlPlugin(),
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
