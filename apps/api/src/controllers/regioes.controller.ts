import type { Request, Response } from 'express';
import { listarRegioes } from '../services/catalog.service.js';
import { parsePagination } from '../validation/query.js';

export async function listRegioesController(req: Request, res: Response): Promise<void> {
  const paginacao = parsePagination(req.query);
  const resultado = await listarRegioes(paginacao);
  res.status(200).json(resultado);
}
