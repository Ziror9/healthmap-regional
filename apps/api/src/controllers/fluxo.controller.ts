import type { Request, Response } from 'express';
import { detalharFluxoMunicipio, listarPolosAtendimento } from '../services/fluxo.service.js';
import { parseIdParam } from '../validation/parse.js';
import { parseFluxoFiltro } from '../validation/query.js';

export async function getFluxoMunicipioController(req: Request, res: Response): Promise<void> {
  const municipioId = parseIdParam(req.params.municipioId, 'municipioId');
  const filtro = parseFluxoFiltro(req.query);
  const resultado = await detalharFluxoMunicipio(municipioId, filtro);
  res.status(200).json(resultado);
}

export async function listPolosAtendimentoController(req: Request, res: Response): Promise<void> {
  const filtro = parseFluxoFiltro(req.query);
  const resultado = await listarPolosAtendimento(filtro);
  res.status(200).json(resultado);
}
