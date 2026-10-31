// Vite configuration (multi-file build in dist/). The single-file offline build is produced by tools/build_single.mjs.
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5173 },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 4096,
  },
  test: {
    include: ['tests/unit/**/*.test.{js,mjs}', 'src/**/__tests__/**/*.test.{js,mjs}'],
    environment: 'node',
  },
});
