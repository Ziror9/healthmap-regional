/**
 * @healthmap/contracts
 *
 * Fonte unica de verdade para os contratos trocados entre apps/api e apps/web.
 * Regra do projeto: nenhum payload analitico sai da API sem envelope de
 * proveniencia (ver ./envelope.ts). Na Fase 0 apenas o contrato de health
 * check existe; os contratos analiticos entram na Fase 3.
 */
export * from './enums.js';
export * from './envelope.js';
export * from './health.js';
