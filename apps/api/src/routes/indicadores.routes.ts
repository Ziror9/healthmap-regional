import { Router } from 'express';
import { listIndicadoresController } from '../controllers/indicadores.controller.js';

export const indicadoresRoutes: Router = Router();

indicadoresRoutes.get('/', listIndicadoresController);
