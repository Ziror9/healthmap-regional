import type { Request, Response } from 'express';
import {
  detalharRiskMunicipio,
  detalharRiskRegiao,
  listarComponentesRiskMunicipio,
  listarComponentesRiskRegiao,
  listarRisk,
  listarRiskRegional,
} from '../services/risk.service.js';
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

// -----------------------------------------------------------------------------
// Grao REGIONAL (Fase 5.5)
// -----------------------------------------------------------------------------

export async function listRiskRegionalController(req: Request, res: Response): Promise<void> {
  const paginacao = parsePagination(req.query);
  const filtros = parseRiskFiltro(req.query);
  const resultado = await listarRiskRegional(filtros, paginacao);
  res.status(200).json(resultado);
}

export async function getRiskRegiaoController(req: Request, res: Response): Promise<void> {
  const regiaoSaudeId = parseIdParam(req.params.regiaoSaudeId, 'regiaoSaudeId');
  const filtros = parseRiskFiltro(req.query);
  const resultado = await detalharRiskRegiao(regiaoSaudeId, filtros);
  res.status(200).json(resultado);
}

export async function getRiskComponentesRegiaoController(req: Request, res: Response): Promise<void> {
  const regiaoSaudeId = parseIdParam(req.params.regiaoSaudeId, 'regiaoSaudeId');
  const filtros = parseRiskFiltro(req.query);
  const resultado = await listarComponentesRiskRegiao(regiaoSaudeId, filtros);
  res.status(200).json(resultado);
}
