import { Router } from 'express';
import { healthRoutes } from './health.routes.js';
import { municipiosRoutes } from './municipios.routes.js';
import { regioesRoutes } from './regioes.routes.js';
import { competenciasRoutes } from './competencias.routes.js';
import { indicadoresRoutes } from './indicadores.routes.js';
import { riskRoutes } from './risk.routes.js';
import { fluxoRoutes } from './fluxo.routes.js';

/**
 * Registro central de rotas.
 *
 * Fase 3: catalogo (municipios/regioes/competencias/indicadores) e o Radar
 * de Risco (risk), somente leitura. Todo endpoint analitico devolve
 * `{ data, meta }`, com origem/natureza explicitas nos itens (ver
 * @healthmap/contracts e docs/fase-3-relatorio.md).
 */
export const routes: Router = Router();

routes.use('/health', healthRoutes);
routes.use('/api/municipios', municipiosRoutes);
routes.use('/api/regioes', regioesRoutes);
routes.use('/api/competencias', competenciasRoutes);
routes.use('/api/indicadores', indicadoresRoutes);
routes.use('/api/risk', riskRoutes);
// Fase 5.8 - fluxo assistencial (residencia -> internacao).
routes.use('/api/fluxo', fluxoRoutes);
