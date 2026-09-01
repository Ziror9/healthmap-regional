import { defineConfig } from 'vitest/config';

/**
 * Testes de packages/db sao de integracao contra um PostgreSQL real
 * compartilhado (nao um banco isolado por worker) - varios arquivos de
 * teste escrevem/leem as mesmas tabelas gold (RiskComponenteValor,
 * RiskScore etc.), e pelo menos um (fase2.test.ts) sobe um processo
 * filho completo (`npm run calculate-risk`) no meio do teste. Rodar
 * arquivos de teste em paralelo (padrao do Vitest) intercala essas
 * escritas entre workers e produz falsos-negativos de contagem (achado
 * na Fase 5.4: a mesma suite passava 16/16 isolada e falhava so quando
 * rodada junto de outros arquivos). fileParallelism:false roda os
 * arquivos em sequencia - mais lento, mas determinístico.
 */
export default defineConfig({
  test: {
    fileParallelism: false,
  },
});
