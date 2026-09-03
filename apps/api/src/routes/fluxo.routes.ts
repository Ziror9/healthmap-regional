import { Router } from 'express';
import { getFluxoMunicipioController, listPolosAtendimentoController } from '../controllers/fluxo.controller.js';

export const fluxoRoutes: Router = Router();

// "polos" antes de qualquer rota com parametro dinamico - mesma licao de
// ordenacao ja aprendida em risk.routes.ts (/regioes antes de /:municipioId).
fluxoRoutes.get('/polos', listPolosAtendimentoController);
fluxoRoutes.get('/municipios/:municipioId', getFluxoMunicipioController);
