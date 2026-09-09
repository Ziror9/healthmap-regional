/**
 * Testes de integracao do Radar Municipal (Fase 5.7) - GET /api/indicadores/municipios.
 *
 * Mesma filosofia de risk.test.ts/indicadores.test.ts: fala com a API real
 * por HTTP, contra o PostgreSQL local ja com a carga REAL (SIH/SIM/IPVS/
 * RiskScore) executada.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiErrorEnvelope, baseUrl, prisma, readJson, startTestServer, stopTestServer } from './setup.js';

beforeAll(startTestServer, 30_000);
afterAll(stopTestServer);

interface RadarMunicipalItem {
  municipio: { id: number; nome: string; codigoIbge7: string };
  valor: number | null;
  disponivel: boolean;
  motivo: string | null;
  origem: 'REAL' | 'DEMO' | null;
}

interface RadarMunicipalEnvelope {
  data: RadarMunicipalItem[];
  meta: {
    filtros: {
      indicador: string;
      ano: number | null;
      anosDisponiveis: number[];
      riskConfigId: number | null;
      origem: string | null;
      unidade: string;
    };
  };
}

async function buscar(query: string): Promise<{ status: number; body: RadarMunicipalEnvelope }> {
  const res = await fetch(`${baseUrl}/api/indicadores/municipios${query}`);
  return { status: res.status, body: await readJson<RadarMunicipalEnvelope>(res) };
}

describe('GET /api/indicadores/municipios (Radar Municipal, Fase 5.7)', () => {
  it('retorna os 645 municipios REAL para INTERNACOES, cada um com codigoIbge7 presente e prefixo 35', async () => {
    const totalReal = await prisma.municipio.count({ where: { codigoIbge7: { startsWith: '35' } } });
    const { status, body } = await buscar('?indicador=INTERNACOES');

    expect(status).toBe(200);
    expect(body.data).toHaveLength(totalReal);
    for (const item of body.data) {
      expect(item.municipio.codigoIbge7).toMatch(/^35\d{5}$/);
    }
  });

  it('o indicador solicitado e o que volta em meta.filtros.indicador (nunca outro)', async () => {
    const { body } = await buscar('?indicador=TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB');
    expect(body.meta.filtros.indicador).toBe('TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB');
    expect(body.meta.filtros.unidade).toBe('por 10.000 habitantes');
  });

  it('municipio suprimido/sem dado tem valor=null e disponivel=false, nunca valor=0', async () => {
    const { body } = await buscar('?indicador=OBITOS_ONCOLOGICOS&ano=2023');
    const indisponiveis = body.data.filter((i) => !i.disponivel);
    expect(indisponiveis.length).toBeGreaterThan(0); // 2023 tem municipios suprimidos (Fase 5.6)
    for (const item of indisponiveis) {
      expect(item.valor).toBeNull();
      expect(item.motivo).not.toBeNull();
    }
    const disponiveis = body.data.filter((i) => i.disponivel);
    for (const item of disponiveis) {
      expect(item.valor).not.toBeNull();
    }
  });

  it('filtro de ano funciona e so aceita anos efetivamente disponiveis (nunca inventa um ano)', async () => {
    const semAno = await buscar('?indicador=OBITOS_ONCOLOGICOS');
    expect(semAno.body.meta.filtros.anosDisponiveis).toContain(2023);
    expect(semAno.body.meta.filtros.anosDisponiveis).toContain(2024);

    const anoInexistente = await fetch(`${baseUrl}/api/indicadores/municipios?indicador=OBITOS_ONCOLOGICOS&ano=1999`);
    expect(anoInexistente.status).toBe(404);
    const erro = await readJson<ApiErrorEnvelope>(anoInexistente);
    expect(erro.error.code).toBe('ANO_NAO_DISPONIVEL');
  });

  it('RISK_SCORE reaproveita RiskScore ja materializado - nenhum RiskConfig/RiskComponenteValor e criado por esta chamada', async () => {
    const totalConfigsAntes = await prisma.riskConfig.count();
    const totalComponentesAntes = await prisma.riskComponenteValor.count();

    const { status, body } = await buscar('?indicador=RISK_SCORE');
    expect(status).toBe(200);
    expect(body.meta.filtros.riskConfigId).not.toBeNull();

    const totalConfigsDepois = await prisma.riskConfig.count();
    const totalComponentesDepois = await prisma.riskComponenteValor.count();
    expect(totalConfigsDepois).toBe(totalConfigsAntes);
    expect(totalComponentesDepois).toBe(totalComponentesAntes);
  });

  it('valores de RISK_SCORE batem com RiskScore.indice ja gravado (nenhum recalculo)', async () => {
    const { body } = await buscar('?indicador=RISK_SCORE');
    const disponivel = body.data.find((i) => i.disponivel);
    expect(disponivel).toBeDefined();

    const scoreNoBanco = await prisma.riskScore.findFirst({
      where: { municipioId: disponivel!.municipio.id, origem: 'REAL' },
      orderBy: { competencia: { dataRef: 'desc' } },
    });
    expect(scoreNoBanco).not.toBeNull();
    expect(disponivel!.valor).toBeCloseTo(Number(scoreNoBanco!.indice), 4);
  });

  it('dados retornados sao REAL (origem), nunca misturados com DEMO', async () => {
    const { body } = await buscar('?indicador=TAXA_INTERNACAO_10K_HAB');
    const comOrigem = body.data.filter((i) => i.origem !== null);
    expect(comOrigem.length).toBeGreaterThan(0);
    for (const item of comOrigem) {
      expect(item.origem).toBe('REAL');
    }
  });

  it('anosDisponiveis de INTERNACOES vem da MESMA fonte que produz os valores (FatoInternacaoResidenciaAnual)', async () => {
    // Regressao: os anos vinham das competencias REAL do SIH enquanto os
    // valores vinham de gold.FatoInternacaoResidenciaAnual (Fase 5.10). As
    // duas fontes coincidem hoje, mas um ano com competencia ingerida e sem
    // agregacao anual apareceria no seletor com os 645 municipios
    // indisponiveis - oferecer um ano e afirmar que ha dado nele.
    const linhas = await prisma.fatoInternacaoResidenciaAnual.findMany({
      where: { origem: 'REAL' },
      select: { ano: true },
      distinct: ['ano'],
      orderBy: { ano: 'asc' },
    });
    const anosNoFato = linhas.map((l) => l.ano);
    expect(anosNoFato.length).toBeGreaterThan(0);

    const { body } = await buscar('?indicador=INTERNACOES');
    expect(body.meta.filtros.anosDisponiveis).toEqual(anosNoFato);
    expect(body.meta.filtros.ano).toBe(anosNoFato[anosNoFato.length - 1]);
  });

  it('todo ano listado em anosDisponiveis de INTERNACOES realmente responde com dado (nenhum ano decorativo)', async () => {
    const { body } = await buscar('?indicador=INTERNACOES');
    for (const ano of body.meta.filtros.anosDisponiveis) {
      const { status, body: doAno } = await buscar(`?indicador=INTERNACOES&ano=${ano}`);
      expect(status).toBe(200);
      expect(doAno.meta.filtros.ano).toBe(ano);
      // Ao menos um municipio com valor - se nenhum tivesse, o ano nao
      // deveria estar sendo oferecido no seletor.
      expect(doAno.data.some((i) => i.disponivel)).toBe(true);
    }
  });

  it('indicador invalido e rejeitado com 400', async () => {
    const res = await fetch(`${baseUrl}/api/indicadores/municipios?indicador=NAO_EXISTE`);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/municipios/:id (extensao Fase 5.7 - totais anuais)', () => {
  it('inclui internacoesAnuais e obitosOncologicosAnuais, nunca 0 quando suprimido', async () => {
    const municipioComObito = await prisma.fatoObitoResidencia.findFirst({ where: { origem: 'REAL', suprimido: true } });
    expect(municipioComObito).not.toBeNull();

    const res = await fetch(`${baseUrl}/api/municipios/${municipioComObito!.municipioResidenciaId}`);
    expect(res.status).toBe(200);
    const body = await readJson<{ data: { obitosOncologicosAnuais: { ano: number; total: number | null; disponivel: boolean }[] } }>(res);

    const linhaSuprimida = body.data.obitosOncologicosAnuais.find((l) => l.ano === municipioComObito!.ano);
    expect(linhaSuprimida).toBeDefined();
    expect(linhaSuprimida!.disponivel).toBe(false);
    expect(linhaSuprimida!.total).toBeNull();
  });
});
