import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiListEnvelope, baseUrl, prisma, readJson, startTestServer, stopTestServer } from './setup.js';

beforeAll(startTestServer, 30_000);
afterAll(stopTestServer);

interface RegiaoItem {
  id: number;
  codigo: string;
  nome: string;
}

describe('GET /api/regioes', () => {
  it('lista as regioes de saude cadastradas', async () => {
    const totalEsperado = await prisma.regiaoSaude.count();

    const res = await fetch(`${baseUrl}/api/regioes`);
    expect(res.status).toBe(200);
    const body = await readJson<ApiListEnvelope<RegiaoItem>>(res);
    expect(body.meta.pagination?.total).toBe(totalEsperado);
    expect(body.data[0]).toHaveProperty('codigo');
    expect(body.data[0]).toHaveProperty('nome');
  });
});
