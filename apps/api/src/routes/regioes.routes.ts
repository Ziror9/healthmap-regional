import { Router } from 'express';
import { listRegioesController } from '../controllers/regioes.controller.js';

export const regioesRoutes: Router = Router();

regioesRoutes.get('/', listRegioesController);
