import { Router } from 'express';
import {
  getRiskComponentesController,
  getRiskMunicipioController,
  listRiskController,
} from '../controllers/risk.controller.js';

export const riskRoutes: Router = Router();

riskRoutes.get('/', listRiskController);
riskRoutes.get('/:municipioId/components', getRiskComponentesController);
riskRoutes.get('/:municipioId', getRiskMunicipioController);
