import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiListEnvelope, baseUrl, prisma, readJson, startTestServer, stopTestServer } from './setup.js';

beforeAll(startTestServer, 30_000);
afterAll(stopTestServer);

interface IndicadorItem {
  chave: string;
  disponivel: boolean;
}

describe('GET /api/indicadores', () => {
  it('lista o catalogo de IndicadorDefinicao com a flag "disponivel" calculada', async () => {
    const totalEsperado = await prisma.indicadorDefinicao.count();

    const res = await fetch(`${baseUrl}/api/indicadores`);
    expect(res.status).toBe(200);
    const body = await readJson<ApiListEnvelope<IndicadorItem>>(res);
    expect(body.meta.pagination?.total).toBe(totalEsperado);
    if (body.data.length > 0) {
      expect(body.data[0]).toHaveProperty('chave');
      expect(typeof body.data[0]?.disponivel).toBe('boolean');
    }
  });
});
