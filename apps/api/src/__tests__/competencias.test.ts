import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiListEnvelope, baseUrl, prisma, readJson, startTestServer, stopTestServer } from './setup.js';

beforeAll(startTestServer, 30_000);
afterAll(stopTestServer);

interface CompetenciaItem {
  id: number;
  ano: number;
  mes: number;
  dataRef: string;
}

describe('GET /api/competencias', () => {
  it('lista competencias ordenadas por dataRef crescente', async () => {
    const res = await fetch(`${baseUrl}/api/competencias`);
    expect(res.status).toBe(200);
    const body = await readJson<ApiListEnvelope<CompetenciaItem>>(res);
    expect(body.data.length).toBeGreaterThan(0);
    const datas = body.data.map((c) => c.dataRef);
    expect(datas).toEqual([...datas].sort());
  });

  it('filtra por ano', async () => {
    const primeira = await prisma.competencia.findFirst();
    expect(primeira).not.toBeNull();
    if (!primeira) return;

    const res = await fetch(`${baseUrl}/api/competencias?ano=${primeira.ano}`);
    expect(res.status).toBe(200);
    const body = await readJson<ApiListEnvelope<CompetenciaItem>>(res);
    expect(body.data.length).toBeGreaterThan(0);
    for (const c of body.data) expect(c.ano).toBe(primeira.ano);
  });

  it('ano invalido -> 400', async () => {
    const res = await fetch(`${baseUrl}/api/competencias?ano=abc`);
    expect(res.status).toBe(400);
  });
});
