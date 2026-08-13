/**
 * @healthmap/contracts
 *
 * Fonte unica de verdade para os contratos trocados entre apps/api e apps/web.
 * Regra do projeto: nenhum payload analitico sai da API sem proveniencia
 * clara (origem/natureza) em algum nivel da resposta - ver ./envelope.ts
 * para o formato generico e ./risk.ts/./indicador.ts para os DTOs
 * analiticos, que carregam origem/natureza por item.
 *
 * Fase 3: catalogo (geo.ts, competencia.ts), Radar (risk.ts),
 * indicadores (indicador.ts), detalhe de municipio (municipio-detalhe.ts),
 * paginacao (pagination.ts) e erro padrao (error.ts).
 */
export * from './enums.js';
export * from './envelope.js';
export * from './health.js';
export * from './pagination.js';
export * from './geo.js';
export * from './competencia.js';
export * from './risk.js';
export * from './indicador.js';
export * from './municipio-detalhe.js';
export * from './error.js';
