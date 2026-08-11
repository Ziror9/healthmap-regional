import { Router } from 'express';
import { healthRoutes } from './health.routes.js';

/**
 * Registro central de rotas.
 *
 * Fase 0: apenas health check. Endpoints analiticos entram na Fase 3 e, quando
 * entrarem, respondem obrigatoriamente com o envelope de proveniencia de
 * @healthmap/contracts.
 */
export const routes: Router = Router();

routes.use('/health', healthRoutes);
