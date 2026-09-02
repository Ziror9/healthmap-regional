import { Router } from 'express';
import { listIndicadoresController, listIndicadorMunicipiosController } from '../controllers/indicadores.controller.js';

export const indicadoresRoutes: Router = Router();

indicadoresRoutes.get('/', listIndicadoresController);
// Fase 5.7 (Radar Municipal) - sem parametro dinamico em /api/indicadores hoje, entao a ordem nao importa aqui.
indicadoresRoutes.get('/municipios', listIndicadorMunicipiosController);
