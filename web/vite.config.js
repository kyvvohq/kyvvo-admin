import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A SPA é servida pelo kyvvo-admin sob /app (ver ../index.js:
// @fastify/static na raiz + fallback de SPA via setNotFoundHandler). `base`
// precisa bater com esse prefixo pros assets buildados (/app/assets/…)
// resolverem.
export default defineConfig({
  base: '/app/',
  plugins: [react()],
  build: {
    outDir: '../public/app',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      // Backend local (`npm start` na raiz deste repo, porta 3004).
      '/api': 'http://localhost:3004',
      // kyvvo-admin NÃO serve /ds/ (o nginx atende direto de
      // /opt/kyvvo/design-system/ em produção) — em dev, proxia pra um
      // produto que já está no ar. Só leitura de CSS/SVG estático.
      '/ds': 'https://admin.kyvvo.com.br',
    },
  },
});
