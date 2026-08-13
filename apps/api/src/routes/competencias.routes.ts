import { Router } from 'express';
import { listCompetenciasController } from '../controllers/competencias.controller.js';

export const competenciasRoutes: Router = Router();

competenciasRoutes.get('/', listCompetenciasController);
