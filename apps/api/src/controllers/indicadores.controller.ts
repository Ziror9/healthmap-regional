import type { Request, Response } from 'express';
import { listarIndicadores } from '../services/catalog.service.js';
import { parsePagination } from '../validation/query.js';

export async function listIndicadoresController(req: Request, res: Response): Promise<void> {
  const paginacao = parsePagination(req.query);
  const resultado = await listarIndicadores(paginacao);
  res.status(200).json(resultado);
}
