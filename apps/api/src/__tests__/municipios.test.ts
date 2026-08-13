import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiErrorEnvelope,
  type ApiItemEnvelope,
  type ApiListEnvelope,
  baseUrl,
  prisma,
  readJson,
  startTestServer,
  stopTestServer,
} from './setup.js';

beforeAll(startTestServer, 30_000);
afterAll(stopTestServer);

interface MunicipioItem {
  id: number;
  codigoIbge7: string;
  regiaoSaude: { id: number; codigo: string; nome: string; uf: string };
}

interface MunicipioDetalhe extends MunicipioItem {
  riscos: unknown[];
  indicadores: unknown[];
}

describe('GET /api/municipios', () => {
  it('lista municipios paginados com regiaoSaude embutida', async () => {
    const res = await fetch(`${baseUrl}/api/municipios?pageSize=3`);
    expect(res.status).toBe(200);
    const body = await readJson<ApiListEnvelope<MunicipioItem>>(res);
    expect(body.data.length).toBeLessThanOrEqual(3);
    expect(body.meta.pagination?.total).toBeGreaterThan(0);
    expect(body.data[0]?.regiaoSaude.codigo).toBeTypeOf('string');
  });

  it('filtra por regiaoSaudeId', async () => {
    const regiao = await prisma.regiaoSaude.findFirst();
    expect(regiao).not.toBeNull();
    if (!regiao) return;

    const res = await fetch(`${baseUrl}/api/municipios?regiaoSaudeId=${regiao.id}`);
    expect(res.status).toBe(200);
    const body = await readJson<ApiListEnvelope<MunicipioItem>>(res);
    expect(body.data.length).toBeGreaterThan(0);
    for (const m of body.data) expect(m.regiaoSaude.id).toBe(regiao.id);
  });

  it('pageSize invalido -> 400', async () => {
    const res = await fetch(`${baseUrl}/api/municipios?pageSize=abc`);
    expect(res.status).toBe(400);
    const body = await readJson<ApiErrorEnvelope>(res);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/municipios/:municipioId', () => {
  it('retorna detalhe com riscos e indicadores disponiveis', async () => {
    const municipio = await prisma.municipio.findFirst();
    expect(municipio).not.toBeNull();
    if (!municipio) return;

    const res = await fetch(`${baseUrl}/api/municipios/${municipio.id}`);
    expect(res.status).toBe(200);
    const body = await readJson<ApiItemEnvelope<MunicipioDetalhe>>(res);
    expect(body.data.id).toBe(municipio.id);
    expect(body.data.codigoIbge7).toBe(municipio.codigoIbge7);
    expect(Array.isArray(body.data.riscos)).toBe(true);
    expect(Array.isArray(body.data.indicadores)).toBe(true);
  });

  it('municipio inexistente -> 404', async () => {
    const res = await fetch(`${baseUrl}/api/municipios/999999`);
    expect(res.status).toBe(404);
    const body = await readJson<ApiErrorEnvelope>(res);
    expect(body.error.code).toBe('MUNICIPIO_NAO_ENCONTRADO');
  });

  it('id nao numerico -> 400', async () => {
    const res = await fetch(`${baseUrl}/api/municipios/abc`);
    expect(res.status).toBe(400);
    const body = await readJson<ApiErrorEnvelope>(res);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
