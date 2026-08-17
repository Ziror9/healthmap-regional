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

interface RiskScoreItem {
  municipio: { id: number; nome: string; codigoIbge7: string };
  competencia: { id: number; ano: number; mes: number };
  riskConfigId: number;
  indice: number;
  classificacao: string;
  confiabilidade: string;
  natureza: string;
  origem: string;
  calculadoEm: string;
}

interface RiskComponenteItem {
  componente: string;
  valorBruto: number | null;
  valorNormalizado: number | null;
  disponivel: boolean;
  origem: string;
}

describe('GET /api/risk', () => {
  it('sem filtros: resolve para a competencia mais recente e devolve itens com todos os campos exigidos', async () => {
    const competenciaMaisRecente = await prisma.competencia.findFirst({ orderBy: { dataRef: 'desc' } });
    expect(competenciaMaisRecente).not.toBeNull();
    if (!competenciaMaisRecente) return;

    const res = await fetch(`${baseUrl}/api/risk`);
    expect(res.status).toBe(200);
    const body = await readJson<ApiListEnvelope<RiskScoreItem>>(res);
    expect(body.meta.filtros?.competenciaId).toBe(competenciaMaisRecente.id);

    for (const item of body.data) {
      expect(typeof item.municipio.id).toBe('number');
      expect(typeof item.competencia.id).toBe('number');
      expect(typeof item.riskConfigId).toBe('number');
      expect(typeof item.indice).toBe('number');
      expect(item.classificacao).toBeTruthy();
      expect(item.confiabilidade).toBeTruthy();
      expect(item.natureza).toBeTruthy();
      // dados DEMO continuam explicitamente identificados em cada item
      expect(item.origem).toBe('DEMO');
      // indicador de frescor (Fase 4): timestamp real de calculo, nao fabricado
      expect(new Date(item.calculadoEm).toString()).not.toBe('Invalid Date');
    }
  });

  it('filtra por competenciaId explicito', async () => {
    const competencia = await prisma.competencia.findFirst({ orderBy: { dataRef: 'asc' } });
    expect(competencia).not.toBeNull();
    if (!competencia) return;

    const res = await fetch(`${baseUrl}/api/risk?competenciaId=${competencia.id}`);
    expect(res.status).toBe(200);
    const body = await readJson<ApiListEnvelope<RiskScoreItem>>(res);
    expect(body.meta.filtros?.competenciaId).toBe(competencia.id);
    for (const item of body.data) expect(item.competencia.id).toBe(competencia.id);
  });

  it('competenciaId inexistente -> 404', async () => {
    const res = await fetch(`${baseUrl}/api/risk?competenciaId=999999`);
    expect(res.status).toBe(404);
    const body = await readJson<ApiErrorEnvelope>(res);
    expect(body.error.code).toBe('COMPETENCIA_NAO_ENCONTRADA');
  });

  it('filtra por riskConfigId explicito', async () => {
    const config = await prisma.riskConfig.findFirst({
      where: { componentes: { some: { ativo: true } } },
      orderBy: { id: 'asc' },
    });
    expect(config).not.toBeNull();
    if (!config) return;

    const res = await fetch(`${baseUrl}/api/risk?riskConfigId=${config.id}`);
    expect(res.status).toBe(200);
    const body = await readJson<ApiListEnvelope<RiskScoreItem>>(res);
    expect(body.meta.filtros?.riskConfigId).toBe(config.id);
    for (const item of body.data) expect(item.riskConfigId).toBe(config.id);
  });

  it('riskConfigId inexistente -> 404', async () => {
    const res = await fetch(`${baseUrl}/api/risk?riskConfigId=999999`);
    expect(res.status).toBe(404);
    const body = await readJson<ApiErrorEnvelope>(res);
    expect(body.error.code).toBe('RISK_CONFIG_NAO_ENCONTRADA');
  });

  it('riskConfig sem componentes: ausencia de dados -> lista vazia coerente, nunca erro', async () => {
    const configVazia = await prisma.riskConfig.findFirst({ where: { componentes: { none: {} } } });
    expect(configVazia).not.toBeNull();
    if (!configVazia) return;

    const res = await fetch(`${baseUrl}/api/risk?riskConfigId=${configVazia.id}`);
    expect(res.status).toBe(200);
    const body = await readJson<ApiListEnvelope<RiskScoreItem>>(res);
    expect(body.data).toEqual([]);
    expect(body.meta.pagination?.total).toBe(0);
  });

  it('filtra por origem=DEMO explicitamente', async () => {
    // Busca a competencia atraves de um RiskScore DEMO existente, em vez de
    // depender de "competencia mais recente" ou "mais antiga" como proxy:
    // desde a Fase 5 a base pode ter competencias so-geograficas/de
    // capacidade (snapshot CNES REAL) ou so-SIH (sem nenhum RiskScore DEMO)
    // tanto antes quanto depois das competencias DEMO na ordenacao por
    // dataRef - ver docs/known-limitations.md.
    const scoreDemo = await prisma.riskScore.findFirst({ where: { origem: 'DEMO' } });
    expect(scoreDemo).not.toBeNull();
    if (!scoreDemo) return;

    const res = await fetch(`${baseUrl}/api/risk?origem=DEMO&competenciaId=${scoreDemo.competenciaId}`);
    expect(res.status).toBe(200);
    const body = await readJson<ApiListEnvelope<RiskScoreItem>>(res);
    expect(body.data.length).toBeGreaterThan(0);
    for (const item of body.data) expect(item.origem).toBe('DEMO');
  });

  it('origem=REAL (nao existe na base DEMO): ausencia de dados -> lista vazia coerente', async () => {
    const res = await fetch(`${baseUrl}/api/risk?origem=REAL`);
    expect(res.status).toBe(200);
    const body = await readJson<ApiListEnvelope<RiskScoreItem>>(res);
    expect(body.data).toEqual([]);
  });

  it('origem invalida -> 400', async () => {
    const res = await fetch(`${baseUrl}/api/risk?origem=INVENTADA`);
    expect(res.status).toBe(400);
  });

  it('page invalido -> 400', async () => {
    const res = await fetch(`${baseUrl}/api/risk?page=0`);
    expect(res.status).toBe(400);
    const body = await readJson<ApiErrorEnvelope>(res);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/risk/:municipioId', () => {
  it('retorna o RiskScore existente para municipio+competencia+riskConfig', async () => {
    const score = await prisma.riskScore.findFirst({ orderBy: { id: 'asc' } });
    expect(score).not.toBeNull();
    if (!score) return;

    const res = await fetch(
      `${baseUrl}/api/risk/${score.municipioId}?competenciaId=${score.competenciaId}&riskConfigId=${score.riskConfigId}`,
    );
    expect(res.status).toBe(200);
    const body = await readJson<ApiItemEnvelope<RiskScoreItem | null>>(res);
    expect(body.data).not.toBeNull();
    expect(body.data?.municipio.id).toBe(score.municipioId);
    expect(body.data?.indice).toBeCloseTo(Number(score.indice), 4);
    expect(body.data?.origem).toBe('DEMO');
  });

  it('municipio inexistente -> 404', async () => {
    const res = await fetch(`${baseUrl}/api/risk/999999`);
    expect(res.status).toBe(404);
    const body = await readJson<ApiErrorEnvelope>(res);
    expect(body.error.code).toBe('MUNICIPIO_NAO_ENCONTRADO');
  });

  it('municipio existe mas RiskConfig pedida nao tem score (config sem componentes): data null, resposta coerente', async () => {
    const municipio = await prisma.municipio.findFirst();
    const configVazia = await prisma.riskConfig.findFirst({ where: { componentes: { none: {} } } });
    expect(municipio).not.toBeNull();
    expect(configVazia).not.toBeNull();
    if (!municipio || !configVazia) return;

    const res = await fetch(`${baseUrl}/api/risk/${municipio.id}?riskConfigId=${configVazia.id}`);
    expect(res.status).toBe(200);
    const body = await readJson<ApiItemEnvelope<RiskScoreItem | null>>(res);
    expect(body.data).toBeNull();
  });

  it('municipioId nao numerico -> 400', async () => {
    const res = await fetch(`${baseUrl}/api/risk/abc`);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/risk/:municipioId/components', () => {
  it('componente indisponivel: valorBruto/valorNormalizado permanecem null, nunca viram 0 (regra de supressao)', async () => {
    const componenteIndisponivel = await prisma.riskComponenteValor.findFirst({ where: { disponivel: false } });
    expect(componenteIndisponivel).not.toBeNull();
    if (!componenteIndisponivel) return;

    const res = await fetch(
      `${baseUrl}/api/risk/${componenteIndisponivel.municipioId}/components` +
        `?competenciaId=${componenteIndisponivel.competenciaId}&riskConfigId=${componenteIndisponivel.riskConfigId}`,
    );
    expect(res.status).toBe(200);
    const body = await readJson<ApiListEnvelope<RiskComponenteItem>>(res);
    const item = body.data.find((c) => c.componente === componenteIndisponivel.componente);
    expect(item).toBeDefined();
    expect(item?.disponivel).toBe(false);
    expect(item?.valorBruto).toBeNull();
    expect(item?.valorNormalizado).toBeNull();
  });

  it('componente disponivel: valorBruto e um numero (nao null, nao string)', async () => {
    const componenteDisponivel = await prisma.riskComponenteValor.findFirst({ where: { disponivel: true } });
    expect(componenteDisponivel).not.toBeNull();
    if (!componenteDisponivel) return;

    const res = await fetch(
      `${baseUrl}/api/risk/${componenteDisponivel.municipioId}/components` +
        `?competenciaId=${componenteDisponivel.competenciaId}&riskConfigId=${componenteDisponivel.riskConfigId}`,
    );
    const body = await readJson<ApiListEnvelope<RiskComponenteItem>>(res);
    const item = body.data.find((c) => c.componente === componenteDisponivel.componente);
    expect(item?.disponivel).toBe(true);
    expect(typeof item?.valorBruto).toBe('number');
  });

  it('municipio inexistente -> 404', async () => {
    const res = await fetch(`${baseUrl}/api/risk/999999/components`);
    expect(res.status).toBe(404);
  });
});
