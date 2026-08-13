import { Router } from 'express';
import { getMunicipioController, listMunicipiosController } from '../controllers/municipios.controller.js';

export const municipiosRoutes: Router = Router();

municipiosRoutes.get('/', listMunicipiosController);
municipiosRoutes.get('/:municipioId', getMunicipioController);
