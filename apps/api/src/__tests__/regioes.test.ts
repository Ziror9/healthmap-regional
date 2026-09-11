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

/**
 * Redesign E6 - a pagina /regioes pinta cada municipio com a classificacao da
 * sua DRS e mostra os componentes da DRS selecionada. Estes testes fixam as
 * propriedades dos endpoints existentes de que ela depende.
 */
interface RegionalEnvelope {
  data: { regiaoSaude: { id: number; codigo: string }; indice: number; origem: string }[];
}

interface ComponentesEnvelope {
  data: { componente: string; disponivel: boolean; valorBruto: number | null; valorNormalizado: number | null }[];
}

interface MunicipiosEnvelope {
  data: { codigoIbge7: string; regiaoSaude: { id: number } }[];
  meta: { pagination: { totalPages: number } };
}

describe('Redesign E6 - invariantes que a pagina de Regioes assume', () => {
  it('origem=REAL devolve as 17 DRS reais e nenhuma regiao ilustrativa', async () => {
    const body = await readJson<RegionalEnvelope>(await fetch(`${baseUrl}/api/risk/regioes?origem=REAL&pageSize=200`));
    expect(body.data).toHaveLength(17);
    expect(body.data.every((s) => s.origem === 'REAL' && s.regiaoSaude.codigo.startsWith('DRS-'))).toBe(true);
  });

  it('todo municipio REAL pertence a uma DRS com indice regional (o mapa nao tem buraco)', async () => {
    const regional = await readJson<RegionalEnvelope>(await fetch(`${baseUrl}/api/risk/regioes?origem=REAL&pageSize=200`));
    const comIndice = new Set(regional.data.map((s) => s.regiaoSaude.id));

    const municipios: MunicipiosEnvelope['data'] = [];
    for (let page = 1; ; page += 1) {
      const body = await readJson<MunicipiosEnvelope>(await fetch(`${baseUrl}/api/municipios?page=${page}&pageSize=200`));
      municipios.push(...body.data);
      if (page >= body.meta.pagination.totalPages) break;
    }
    const reais = municipios.filter((m) => m.codigoIbge7.startsWith('35'));
    expect(reais).toHaveLength(645);
    expect(reais.filter((m) => !comIndice.has(m.regiaoSaude.id))).toEqual([]);
  });

  it('componente regional indisponivel nunca carrega valor (a pagina mostra o motivo, nunca 0)', async () => {
    const regional = await readJson<RegionalEnvelope>(await fetch(`${baseUrl}/api/risk/regioes?origem=REAL&pageSize=200`));
    for (const score of regional.data) {
      const body = await readJson<ComponentesEnvelope>(
        await fetch(`${baseUrl}/api/risk/regioes/${score.regiaoSaude.id}/components?origem=REAL`),
      );
      expect(body.data).toHaveLength(4);
      for (const item of body.data.filter((c) => !c.disponivel)) {
        expect(item.valorBruto).toBeNull();
        expect(item.valorNormalizado).toBeNull();
      }
    }
  });
});
