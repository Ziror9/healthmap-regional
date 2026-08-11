import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Packages internos sao consumidos como codigo-fonte TypeScript e por isso
  // precisam ser empacotados junto. Dependencias externas ficam de fora.
  noExternal: ['@healthmap/contracts', '@healthmap/db'],
});
