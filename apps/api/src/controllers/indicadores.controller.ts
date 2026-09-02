import type { Request, Response } from 'express';
import { listarIndicadores, listarIndicadorMunicipios } from '../services/catalog.service.js';
import { parsePagination, parseRadarMunicipalFiltro } from '../validation/query.js';

export async function listIndicadoresController(req: Request, res: Response): Promise<void> {
  const paginacao = parsePagination(req.query);
  const resultado = await listarIndicadores(paginacao);
  res.status(200).json(resultado);
}

/** GET /api/indicadores/municipios - Radar Municipal (Fase 5.7): um indicador, todos os municipios REAL, de uma vez. */
export async function listIndicadorMunicipiosController(req: Request, res: Response): Promise<void> {
  const filtro = parseRadarMunicipalFiltro(req.query);
  const resultado = await listarIndicadorMunicipios(filtro);
  res.status(200).json(resultado);
}
