import { Router } from 'express';
import { healthController, readinessController } from '../controllers/health.controller.js';

export const healthRoutes: Router = Router();

/** GET /health - liveness. */
healthRoutes.get('/', healthController);

/** GET /health/ready - readiness, inclui a conexao com o PostgreSQL. */
healthRoutes.get('/ready', readinessController);
