import type { Request, Response } from 'express';
import { detalharRiskMunicipio, listarComponentesRiskMunicipio, listarRisk } from '../services/risk.service.js';
import { parseIdParam } from '../validation/parse.js';
import { parsePagination, parseRiskFiltro } from '../validation/query.js';

export async function listRiskController(req: Request, res: Response): Promise<void> {
  const paginacao = parsePagination(req.query);
  const filtros = parseRiskFiltro(req.query);
  const resultado = await listarRisk(filtros, paginacao);
  res.status(200).json(resultado);
}

export async function getRiskMunicipioController(req: Request, res: Response): Promise<void> {
  const municipioId = parseIdParam(req.params.municipioId, 'municipioId');
  const filtros = parseRiskFiltro(req.query);
  const resultado = await detalharRiskMunicipio(municipioId, filtros);
  res.status(200).json(resultado);
}

export async function getRiskComponentesController(req: Request, res: Response): Promise<void> {
  const municipioId = parseIdParam(req.params.municipioId, 'municipioId');
  const filtros = parseRiskFiltro(req.query);
  const resultado = await listarComponentesRiskMunicipio(municipioId, filtros);
  res.status(200).json(resultado);
}
