/**
 * Testes de integracao do fluxo assistencial (Fase 5.8) - GET /api/fluxo/*.
 *
 * Rodam contra a API real + PostgreSQL local com a carga SIH REAL executada
 * (etl/ingest_sih.py, que agora tambem grava gold.FatoFluxoInternacao).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiErrorEnvelope, baseUrl, prisma, readJson, startTestServer, stopTestServer } from './setup.js';

beforeAll(startTestServer, 30_000);
afterAll(stopTestServer);

interface FluxoItem {
  municipio: { id: number; nome: string; codigoIbge7: string };
  internacoes: number | null;
  suprimido: boolean;
  mesmoMunicipio: boolean;
  origem: 'REAL' | 'DEMO';
}

interface FluxoMunicipioEnvelope {
  data: {
    municipio: { id: number; nome: string; codigoIbge7: string };
    ano: number;
    saidas: FluxoItem[];
    entradas: FluxoItem[];
    resumo: {
      internacoesVisiveis: number;
      internacoesNoProprioMunicipio: number;
      internacoesForaDoMunicipio: number;
      paresSuprimidos: number;
      destinosVisiveis: number;
      taxaFluxoExternoVisivel: number | null;
    };
  } | null;
  meta: { filtros: { ano: number | null; anosDisponiveis: number[]; origem: string | null } };
}

interface PolosEnvelope {
  data: {
    municipio: { id: number; nome: string; codigoIbge7: string };
    internacoesRecebidasDeFora: number;
    municipiosDeOrigem: number;
    origem: 'REAL' | 'DEMO';
  }[];
  meta: { filtros: { ano: number | null; anosDisponiveis: number[]; origem: string | null } };
}

describe('GET /api/fluxo/polos', () => {
  it('lista polos ordenados por volume recebido de fora, com ano resolvido a partir da base', async () => {
    const res = await fetch(`${baseUrl}/api/fluxo/polos?limite=5`);
    expect(res.status).toBe(200);
    const body = await readJson<PolosEnvelope>(res);

    expect(body.meta.filtros.anosDisponiveis.length).toBeGreaterThan(0);
    expect(body.meta.filtros.ano).not.toBeNull();
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.length).toBeLessThanOrEqual(5);

    for (let i = 1; i < body.data.length; i += 1) {
      expect(body.data[i - 1]!.internacoesRecebidasDeFora).toBeGreaterThanOrEqual(body.data[i]!.internacoesRecebidasDeFora);
    }
    for (const polo of body.data) {
      expect(polo.municipio.codigoIbge7).toMatch(/^35\d{5}$/);
      expect(polo.municipiosDeOrigem).toBeGreaterThan(0);
    }
  });

  it('ano inexistente -> 404 (nunca inventa um ano)', async () => {
    const res = await fetch(`${baseUrl}/api/fluxo/polos?ano=1999`);
    expect(res.status).toBe(404);
    const erro = await readJson<ApiErrorEnvelope>(res);
    expect(erro.error.code).toBe('ANO_NAO_DISPONIVEL');
  });
});

describe('GET /api/fluxo/municipios/:municipioId', () => {
  it('devolve saidas, entradas e resumo coerentes para um municipio com fluxo visivel', async () => {
    const parVisivel = await prisma.fatoFluxoInternacao.findFirst({
      where: { origem: 'REAL', suprimido: false },
      orderBy: { internacoes: 'desc' },
    });
    expect(parVisivel).not.toBeNull();

    const res = await fetch(`${baseUrl}/api/fluxo/municipios/${parVisivel!.municipioResidenciaId}`);
    expect(res.status).toBe(200);
    const body = await readJson<FluxoMunicipioEnvelope>(res);
    expect(body.data).not.toBeNull();

    const { resumo, saidas } = body.data!;
    expect(saidas.length).toBeGreaterThan(0);
    // O resumo e a soma das saidas visiveis - nunca inclui par suprimido.
    const somaVisivel = saidas
      .filter((s) => !s.suprimido && s.internacoes !== null)
      .reduce((total, s) => total + s.internacoes!, 0);
    expect(resumo.internacoesVisiveis).toBe(somaVisivel);
    expect(resumo.internacoesNoProprioMunicipio + resumo.internacoesForaDoMunicipio).toBe(resumo.internacoesVisiveis);
  });

  it('par suprimido chega como internacoes=null e suprimido=true, nunca 0', async () => {
    const parSuprimido = await prisma.fatoFluxoInternacao.findFirst({ where: { origem: 'REAL', suprimido: true } });
    expect(parSuprimido).not.toBeNull();

    const res = await fetch(`${baseUrl}/api/fluxo/municipios/${parSuprimido!.municipioResidenciaId}`);
    const body = await readJson<FluxoMunicipioEnvelope>(res);
    const suprimidos = body.data!.saidas.filter((s) => s.suprimido);
    expect(suprimidos.length).toBeGreaterThan(0);
    for (const item of suprimidos) {
      expect(item.internacoes).toBeNull();
    }
  });

  it('taxa de fluxo externo e derivada apenas do volume visivel (ou null), nunca 0 por ausencia de dado', async () => {
    const parVisivel = await prisma.fatoFluxoInternacao.findFirst({
      where: { origem: 'REAL', suprimido: false },
      orderBy: { internacoes: 'desc' },
    });
    const res = await fetch(`${baseUrl}/api/fluxo/municipios/${parVisivel!.municipioResidenciaId}`);
    const body = await readJson<FluxoMunicipioEnvelope>(res);
    const { resumo } = body.data!;

    if (resumo.internacoesVisiveis === 0) {
      expect(resumo.taxaFluxoExternoVisivel).toBeNull();
    } else {
      expect(resumo.taxaFluxoExternoVisivel).toBeCloseTo(resumo.internacoesForaDoMunicipio / resumo.internacoesVisiveis, 6);
    }
  });

  it('o par origem==destino e marcado como mesmoMunicipio (atendimento local nao e deslocamento)', async () => {
    const parLocal = await prisma.$queryRaw<{ municipioResidenciaId: number }[]>`
      SELECT "municipioResidenciaId" FROM gold."FatoFluxoInternacao"
      WHERE origem = 'REAL' AND suprimido = false AND "municipioResidenciaId" = "municipioInternacaoId"
      LIMIT 1
    `;
    expect(parLocal.length).toBe(1);

    const res = await fetch(`${baseUrl}/api/fluxo/municipios/${parLocal[0]!.municipioResidenciaId}`);
    const body = await readJson<FluxoMunicipioEnvelope>(res);
    const local = body.data!.saidas.filter((s) => s.mesmoMunicipio);
    expect(local.length).toBe(1);
    expect(local[0]!.municipio.id).toBe(parLocal[0]!.municipioResidenciaId);
  });

  it('municipio inexistente -> 404', async () => {
    const res = await fetch(`${baseUrl}/api/fluxo/municipios/999999`);
    expect(res.status).toBe(404);
  });
});

describe('Fase 5.8 - integridade do fato de fluxo', () => {
  it('todo par aponta para dois municipios REAL de SP (nunca DEMO, nunca outra UF)', async () => {
    const foraDeSp = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) as total FROM gold."FatoFluxoInternacao" f
      JOIN silver."Municipio" origem ON origem.id = f."municipioResidenciaId"
      JOIN silver."Municipio" destino ON destino.id = f."municipioInternacaoId"
      WHERE f.origem = 'REAL'
        AND (origem."codigoIbge7" NOT LIKE '35%' OR destino."codigoIbge7" NOT LIKE '35%')
    `;
    expect(Number(foraDeSp[0]?.total ?? -1)).toBe(0);
  });

  it('nenhum par nao-suprimido tem internacoes abaixo do limiar (n<5)', async () => {
    const abaixoDoLimiar = await prisma.fatoFluxoInternacao.count({
      where: { origem: 'REAL', suprimido: false, internacoes: { lt: 5 } },
    });
    expect(abaixoDoLimiar).toBe(0);
  });

  it('nenhum par suprimido carrega valor (NULL nunca vira 0)', async () => {
    const suprimidoComValor = await prisma.fatoFluxoInternacao.count({
      where: { origem: 'REAL', suprimido: true, internacoes: { not: null } },
    });
    expect(suprimidoComValor).toBe(0);
  });
});

/**
 * Proveniencia (CLAUDE.md #2): a origem efetivamente aplicada na consulta
 * tem de ser a mesma declarada no `meta`. Antes desta correcao o repositorio
 * filtrava REAL por default e o `meta` devolvia `origem: null` - um numero
 * REAL entregue sem dizer que era REAL.
 */
describe('Fluxo - proveniencia declarada (correcao pos-Fase 5.10)', () => {
  it('sem parametro de origem: a API declara REAL no meta e todo item carrega origem REAL', async () => {
    const parVisivel = await prisma.fatoFluxoInternacao.findFirst({
      where: { origem: 'REAL', suprimido: false },
      orderBy: { internacoes: 'desc' },
    });

    const res = await fetch(`${baseUrl}/api/fluxo/municipios/${parVisivel!.municipioResidenciaId}`);
    const body = await readJson<FluxoMunicipioEnvelope>(res);

    expect(body.meta.filtros.origem).toBe('REAL');
    expect(body.data!.saidas.length).toBeGreaterThan(0);
    for (const item of [...body.data!.saidas, ...body.data!.entradas]) {
      expect(item.origem).toBe('REAL');
    }
  });

  it('polos tambem declaram REAL por padrao, no meta e por item', async () => {
    const res = await fetch(`${baseUrl}/api/fluxo/polos?limite=5`);
    const body = await readJson<PolosEnvelope>(res);

    expect(body.meta.filtros.origem).toBe('REAL');
    expect(body.data.length).toBeGreaterThan(0);
    for (const polo of body.data) {
      expect(polo.origem).toBe('REAL');
    }
  });

  it('origem=DEMO e respeitada: o meta declara DEMO e nenhum item REAL vaza na resposta', async () => {
    const totalDemo = await prisma.fatoFluxoInternacao.count({ where: { origem: 'DEMO' } });

    const resPolos = await fetch(`${baseUrl}/api/fluxo/polos?origem=DEMO`);
    expect(resPolos.status).toBe(200);
    const polos = await readJson<PolosEnvelope>(resPolos);
    expect(polos.meta.filtros.origem).toBe('DEMO');
    // A base atual nao tem fluxo DEMO: a resposta correta e vazia e
    // declarada como DEMO - nunca cair de volta em REAL para "ter o que
    // mostrar". Se um dia houver fluxo DEMO, todo item tem de ser DEMO.
    if (totalDemo === 0) expect(polos.data).toHaveLength(0);
    for (const polo of polos.data) {
      expect(polo.origem).toBe('DEMO');
    }

    // Os anos oferecidos sao os DAQUELA origem - nunca os da outra.
    const anosDemoNoBanco = await prisma.fatoFluxoInternacao.findMany({
      where: { origem: 'DEMO' },
      select: { ano: true },
      distinct: ['ano'],
      orderBy: { ano: 'asc' },
    });
    expect(polos.meta.filtros.anosDisponiveis).toEqual(anosDemoNoBanco.map((l) => l.ano));
  });

  it('a origem declarada no meta e sempre uma origem concreta, nunca null', async () => {
    const paraChecar = ['', '?origem=REAL', '?origem=DEMO'];
    for (const query of paraChecar) {
      const res = await fetch(`${baseUrl}/api/fluxo/polos${query}`);
      const body = await readJson<PolosEnvelope>(res);
      expect(['REAL', 'DEMO']).toContain(body.meta.filtros.origem);
    }
  });
});

/**
 * Fase 5.11 - o mapa de fluxo combina dois endpoints e soma, na tela, as
 * entradas visiveis de um polo. Estes testes fixam as propriedades de que ele
 * depende, para que uma mudanca no servidor nao faca a pagina mostrar um
 * numero diferente do ranking de polos sem que ninguem perceba.
 */
describe('Fase 5.11 - invariantes que o mapa de fluxo assume', () => {
  it('para cada polo, as entradas visiveis de fora somam exatamente o volume e a contagem do ranking de polos', async () => {
    const polos = await readJson<PolosEnvelope>(await fetch(`${baseUrl}/api/fluxo/polos?limite=5`));
    expect(polos.data.length).toBeGreaterThan(0);

    for (const polo of polos.data) {
      const detalhe = await readJson<FluxoMunicipioEnvelope>(await fetch(`${baseUrl}/api/fluxo/municipios/${polo.municipio.id}`));
      const deFora = detalhe.data!.entradas.filter((e) => !e.suprimido && !e.mesmoMunicipio && e.internacoes !== null);
      expect(deFora.reduce((total, e) => total + e.internacoes!, 0)).toBe(polo.internacoesRecebidasDeFora);
      expect(deFora.length).toBe(polo.municipiosDeOrigem);
    }
  });

  it('o resumo de saida conta exatamente os pares da lista (visiveis e suprimidos)', async () => {
    const polos = await readJson<PolosEnvelope>(await fetch(`${baseUrl}/api/fluxo/polos?limite=3`));
    for (const polo of polos.data) {
      const detalhe = await readJson<FluxoMunicipioEnvelope>(await fetch(`${baseUrl}/api/fluxo/municipios/${polo.municipio.id}`));
      const { saidas, resumo } = detalhe.data!;
      expect(resumo.paresSuprimidos).toBe(saidas.filter((s) => s.suprimido).length);
      expect(resumo.destinosVisiveis).toBe(saidas.filter((s) => !s.suprimido).length);
    }
  });

  it('origem com todo o fluxo suprimido: nenhum volume visivel e taxa derivada null, nunca 0', async () => {
    const [origem] = await prisma.$queryRaw<{ id: number }[]>`
      SELECT "municipioResidenciaId" AS id FROM gold."FatoFluxoInternacao"
      WHERE origem = 'REAL' GROUP BY 1 HAVING bool_and(suprimido) ORDER BY 1 LIMIT 1
    `;
    expect(origem).toBeDefined();

    const detalhe = await readJson<FluxoMunicipioEnvelope>(await fetch(`${baseUrl}/api/fluxo/municipios/${origem!.id}`));
    const { saidas, resumo } = detalhe.data!;
    expect(saidas.length).toBeGreaterThan(0);
    expect(saidas.every((s) => s.suprimido && s.internacoes === null)).toBe(true);
    expect(resumo.internacoesVisiveis).toBe(0);
    expect(resumo.paresSuprimidos).toBe(saidas.length);
    expect(resumo.taxaFluxoExternoVisivel).toBeNull();
  });

  it('municipio que nao recebe nenhum paciente devolve entradas vazias, e nao erro', async () => {
    const [municipio] = await prisma.$queryRaw<{ id: number }[]>`
      SELECT m.id FROM silver."Municipio" m
      WHERE m."codigoIbge7" LIKE '35%'
        AND NOT EXISTS (SELECT 1 FROM gold."FatoFluxoInternacao" f WHERE f."municipioInternacaoId" = m.id)
      ORDER BY m.id LIMIT 1
    `;
    expect(municipio).toBeDefined();

    const res = await fetch(`${baseUrl}/api/fluxo/municipios/${municipio!.id}`);
    expect(res.status).toBe(200);
    const detalhe = await readJson<FluxoMunicipioEnvelope>(res);
    expect(detalhe.data!.entradas).toEqual([]);
  });
});
