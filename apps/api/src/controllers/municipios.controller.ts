import type { Request, Response } from 'express';
import { detalharMunicipio, listarMunicipios } from '../services/catalog.service.js';
import { parseIdParam } from '../validation/parse.js';
import { parseMunicipioDetalheFiltro, parseMunicipiosFiltro, parsePagination } from '../validation/query.js';

export async function listMunicipiosController(req: Request, res: Response): Promise<void> {
  const paginacao = parsePagination(req.query);
  const filtros = parseMunicipiosFiltro(req.query);
  const resultado = await listarMunicipios(paginacao, filtros);
  res.status(200).json(resultado);
}

export async function getMunicipioController(req: Request, res: Response): Promise<void> {
  const municipioId = parseIdParam(req.params.municipioId, 'municipioId');
  const filtros = parseMunicipioDetalheFiltro(req.query);
  const municipio = await detalharMunicipio(municipioId, filtros);
  res.status(200).json({ data: municipio });
}
