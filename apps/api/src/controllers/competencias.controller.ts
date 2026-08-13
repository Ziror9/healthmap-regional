import type { Request, Response } from 'express';
import { listarCompetencias } from '../services/catalog.service.js';
import { parseCompetenciasFiltro, parsePagination } from '../validation/query.js';

export async function listCompetenciasController(req: Request, res: Response): Promise<void> {
  const paginacao = parsePagination(req.query);
  const filtros = parseCompetenciasFiltro(req.query);
  const resultado = await listarCompetencias(paginacao, filtros);
  res.status(200).json(resultado);
}
