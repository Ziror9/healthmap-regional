import { Router } from 'express';
import {
  getRiskComponentesController,
  getRiskComponentesRegiaoController,
  getRiskMunicipioController,
  getRiskRegiaoController,
  listRiskController,
  listRiskRegionalController,
} from '../controllers/risk.controller.js';

export const riskRoutes: Router = Router();

riskRoutes.get('/', listRiskController);
// Grao REGIONAL (Fase 5.5) - precisa vir antes de /:municipioId, senao
// "regioes" seria interpretado como um municipioId invalido (400).
riskRoutes.get('/regioes', listRiskRegionalController);
riskRoutes.get('/regioes/:regiaoSaudeId/components', getRiskComponentesRegiaoController);
riskRoutes.get('/regioes/:regiaoSaudeId', getRiskRegiaoController);
riskRoutes.get('/:municipioId/components', getRiskComponentesController);
riskRoutes.get('/:municipioId', getRiskMunicipioController);
