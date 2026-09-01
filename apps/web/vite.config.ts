import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' — build dziala zarowno na GitHub Pages (dowolna sciezka repo),
// jak i po otwarciu z dysku / wewnatrz powloki desktopowej.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    // Pakiety workspace sa w TypeScripcie - wskazujemy zrodla wprost,
    // dzieki czemu dziala HMR na calym monorepo bez kroku budowania.
    alias: {
      '@zl3avr/avr-core': resolve(__dirname, '../../packages/avr-core/src/index.ts'),
      '@zl3avr/board': resolve(__dirname, '../../packages/board/src/index.ts'),
    },
  },
  /*
    Izolacja miedzy zrodlami. Bez tych dwoch naglowkow przegladarka nie daje
    `SharedArrayBuffer`, a bez niego nie da sie zatrzymac watku Pythona w oczekiwaniu
    na ramke albo na wpisana liczbe - skrypt z laboratorium musialby zostac
    przepisany, a ma dzialac bez zmian.

    Na hostingu plikow statycznych naglowkow nie da sie ustawic; tam to samo
    zalatwia `public/coi-serviceworker.js`.
  */
  server: {
    port: 5173,
    fs: { allow: ['../..'] },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    // Monaco to ~840 kB po gzip i praktycznie sie nie zmienia — wydzielamy go
    // do osobnego chunka, zeby przegladarka trzymala go w cache miedzy wdrozeniami.
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('monaco-editor') ? 'monaco' : undefined),
      },
    },
  },
})
