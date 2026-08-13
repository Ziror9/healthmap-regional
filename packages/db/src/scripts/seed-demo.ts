/**
 * Seed DEMO deterministico da Fase 1.
 *
 * Uso, a partir da raiz do repositorio: npm run db:seed
 *
 * Objetivo: popular o banco com dados suficientes para validar a Fase 1
 * (schema, migrations, linhagem, supressao) - NAO e uma carga realista nem
 * uma base grande. Todo dado gerado aqui tem origem = DEMO e execucaoId
 * apontando para uma IngestaoExecucao cuja fonte e 'GERADOR_DEMO'.
 *
 * Determinismo: um unico PRNG seedado (mulberry32) e consumido em ordem de
 * iteracao fixa (municipios -> competencias -> faixas -> sexos, sempre na
 * mesma ordem declarada abaixo). Rodar este script varias vezes produz
 * sempre os mesmos valores. Idempotencia: toda escrita usa `upsert` sobre a
 * chave natural de cada tabela (as mesmas dos `@@unique` do schema), entao
 * reexecutar o seed converge para o mesmo estado em vez de duplicar linhas.
 *
 * IMPORTANTE sobre a geografia: os NOMES dos municipios sao reais (dado
 * publico). Os codigos IBGE abaixo sao SINTETICOS (prefixo '35' + indice
 * sequencial), deliberadamente nao-realistas para nao serem confundidos com
 * codigos oficiais (CLAUDE.md proibe apresentar dado inventado como se fosse
 * fonte oficial). Isso e uma pendencia explicita - ver docs/known-limitations.md:
 * a base geografica completa e real (645 municipios de SP) fica para quando
 * houver uma fonte oficial machine-readable a ingerir, nao para ser digitada
 * de memoria.
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import type { FaixaEtaria as FaixaEtariaType, Sexo as SexoType, TipoLeito as TipoLeitoType } from '@prisma/client';
import { getPrismaClient, disconnectPrisma } from '../index.js';

loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv({ path: resolve(process.cwd(), '.env') });

const prisma = getPrismaClient();

// -----------------------------------------------------------------------------
// PRNG deterministico (mulberry32) - nenhuma dependencia externa.
// -----------------------------------------------------------------------------
function mulberry32(seedInicial: number): () => number {
  let seed = seedInicial;
  return function random(): number {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED_DETERMINISTICO = 20250101;
const rng = mulberry32(SEED_DETERMINISTICO);

/** n < LIMIAR_SUPRESSAO => celula suprimida. Parametro provisorio - ver
 * docs/known-limitations.md (sujeito a revisao metodologica/juridica futura). */
const LIMIAR_SUPRESSAO = 5;

const VERSAO_SEED = 'seed-demo@1.0.0';

// -----------------------------------------------------------------------------
// Geografia DEMO (ver aviso no cabecalho do arquivo)
// -----------------------------------------------------------------------------
interface MunicipioSeed {
  nome: string;
  regiao: string;
  populacao: number;
  polo: boolean;
}

const REGIOES = [
  'Regiao Metropolitana (ilustrativa)',
  'Regiao de Campinas (ilustrativa)',
  'Regiao de Ribeirao Preto (ilustrativa)',
  'Regiao do Oeste Paulista (ilustrativa)',
  'Regiao da Baixada Santista (ilustrativa)',
] as const;

const MUNICIPIOS: MunicipioSeed[] = [
  { nome: 'Sao Paulo', regiao: REGIOES[0], populacao: 11_000_000, polo: true },
  { nome: 'Guarulhos', regiao: REGIOES[0], populacao: 1_400_000, polo: false },
  { nome: 'Sao Jose dos Campos', regiao: REGIOES[0], populacao: 730_000, polo: false },
  { nome: 'Campinas', regiao: REGIOES[1], populacao: 1_200_000, polo: true },
  { nome: 'Sorocaba', regiao: REGIOES[1], populacao: 690_000, polo: false },
  { nome: 'Aguas de Sao Pedro', regiao: REGIOES[1], populacao: 3_500, polo: false },
  { nome: 'Ribeirao Preto', regiao: REGIOES[2], populacao: 700_000, polo: true },
  { nome: 'Franca', regiao: REGIOES[2], populacao: 360_000, polo: false },
  { nome: 'Sao Carlos', regiao: REGIOES[2], populacao: 260_000, polo: false },
  { nome: 'Barretos', regiao: REGIOES[2], populacao: 120_000, polo: true },
  { nome: 'Bauru', regiao: REGIOES[3], populacao: 380_000, polo: false },
  { nome: 'Marilia', regiao: REGIOES[3], populacao: 240_000, polo: false },
  { nome: 'Presidente Prudente', regiao: REGIOES[3], populacao: 230_000, polo: false },
  { nome: 'Bora', regiao: REGIOES[3], populacao: 830, polo: false },
  { nome: 'Santos', regiao: REGIOES[4], populacao: 430_000, polo: false },
];

const COMPETENCIAS = [
  { ano: 2025, mes: 1, dias: 31 },
  { ano: 2025, mes: 2, dias: 28 },
  { ano: 2025, mes: 3, dias: 31 },
  { ano: 2025, mes: 4, dias: 30 },
  { ano: 2025, mes: 5, dias: 31 },
  { ano: 2025, mes: 6, dias: 30 },
];

const FAIXAS: FaixaEtariaType[] = [
  'FX_00_09',
  'FX_10_19',
  'FX_20_29',
  'FX_30_39',
  'FX_40_49',
  'FX_50_59',
  'FX_60_69',
  'FX_70_79',
  'FX_80_MAIS',
];
const SEXOS: SexoType[] = ['MASCULINO', 'FEMININO'];
const TIPOS_LEITO: TipoLeitoType[] = ['CLINICO', 'CIRURGICO', 'UTI', 'OUTRO'];

/** Fracao da populacao em cada faixa etaria (soma ~1 por sexo). Piramide simplificada. */
const FRACAO_FAIXA: Record<FaixaEtariaType, number> = {
  FX_00_09: 0.13,
  FX_10_19: 0.14,
  FX_20_29: 0.15,
  FX_30_39: 0.15,
  FX_40_49: 0.13,
  FX_50_59: 0.11,
  FX_60_69: 0.09,
  FX_70_79: 0.06,
  FX_80_MAIS: 0.04,
};

/** Peso relativo de incidencia oncologica por faixa - ilustrativo, sem base clinica. */
const PESO_INCIDENCIA: Record<FaixaEtariaType, number> = {
  FX_00_09: 0.05,
  FX_10_19: 0.08,
  FX_20_29: 0.15,
  FX_30_39: 0.3,
  FX_40_49: 0.6,
  FX_50_59: 1.0,
  FX_60_69: 1.4,
  FX_70_79: 1.3,
  FX_80_MAIS: 0.9,
};

/**
 * Fracao ilustrativa da populacao-celula que interna no mes. Ordem de
 * grandeza, nao clinica. Ajustada na Fase 2 (de 0.00035 para 0.0011) para
 * que municipios de maior porte tenham, em pelo menos algumas competencias,
 * TODAS as celulas de faixa/sexo acima do limiar de supressao - sem isso,
 * nao ha como demonstrar honestamente um municipio com Pressao Hospitalar
 * Estimada disponivel (ver docs/fase-2-relatorio.md, secao sobre agregacao
 * e supressao). Municipios pequenos (Bora, Aguas de Sao Pedro) continuam
 * suprimidos na maioria das celulas mesmo com este ajuste - a mudanca nao
 * elimina os cenarios de supressao exigidos, so deixa de forcar TODOS os
 * municipios a eles.
 */
const INCIDENCIA_BASE_MENSAL = 0.0011;

const FRACAO_LEITO: Record<TipoLeitoType, number> = {
  CLINICO: 0.45,
  CIRURGICO: 0.25,
  UTI: 0.1,
  OUTRO: 0.2,
};

function ibgeCode(index: number): { codigo7: string; codigo6: string } {
  // codigo6 carrega o indice (unico por municipio); codigo7 = codigo6 + digito
  // extra, espelhando a relacao real (IBGE7 = IBGE6 + digito verificador),
  // sem que isso seja um digito verificador de verdade - e sintetico.
  const codigo6 = `35${String(index).padStart(4, '0')}`;
  const codigo7 = `${codigo6}0`;
  return { codigo7, codigo6 };
}

function jitter(min: number, max: number): number {
  return min + rng() * (max - min);
}

async function run(): Promise<void> {
  console.info(`[seed] iniciando seed DEMO deterministico (seed=${SEED_DETERMINISTICO})`);

  // ---------------------------------------------------------------------
  // 1. FonteDados + IngestaoExecucao de referencia (geografia + config)
  // ---------------------------------------------------------------------
  await prisma.fonteDados.upsert({
    where: { chave: 'GERADOR_DEMO' },
    update: {},
    create: {
      chave: 'GERADOR_DEMO',
      nome: 'Gerador de dados sinteticos DEMO (Fase 1)',
      periodicidade: 'SOB_DEMANDA',
      ativo: true,
    },
  });

  const execucaoRef = await prisma.ingestaoExecucao.upsert({
    where: { id: 'demo-execucao-referencia' },
    update: {},
    create: {
      id: 'demo-execucao-referencia',
      fonteDadosId: 'GERADOR_DEMO',
      status: 'SUCESSO',
      hashInsumos: `seed:${SEED_DETERMINISTICO}:referencia`,
      versaoPipeline: VERSAO_SEED,
      iniciadoEm: new Date('2025-01-01T00:00:00Z'),
      finalizadoEm: new Date('2025-01-01T00:00:05Z'),
      linhasProcessadas: MUNICIPIOS.length + REGIOES.length,
      linhasRejeitadas: 0,
    },
  });
  console.info(`[seed] IngestaoExecucao de referencia: ${execucaoRef.id}`);

  // ---------------------------------------------------------------------
  // 2. RegiaoSaude + Municipio
  // ---------------------------------------------------------------------
  const regiaoIdPorNome = new Map<string, number>();
  for (const [i, nome] of REGIOES.entries()) {
    const regiao = await prisma.regiaoSaude.upsert({
      where: { codigo: `DEMO-DRS-${i + 1}` },
      update: { nome },
      create: { codigo: `DEMO-DRS-${i + 1}`, nome, uf: 'SP' },
    });
    regiaoIdPorNome.set(nome, regiao.id);
  }

  const municipioIdPorNome = new Map<string, number>();
  const municipioPopPorNome = new Map<string, number>();
  const municipioPoloPorNome = new Map<string, boolean>();
  for (const [i, m] of MUNICIPIOS.entries()) {
    const { codigo7, codigo6 } = ibgeCode(i + 1);
    const municipio = await prisma.municipio.upsert({
      where: { codigoIbge7: codigo7 },
      update: { nome: m.nome, regiaoSaudeId: regiaoIdPorNome.get(m.regiao)! },
      create: {
        codigoIbge7: codigo7,
        codigoIbge6: codigo6,
        nome: m.nome,
        uf: 'SP',
        regiaoSaudeId: regiaoIdPorNome.get(m.regiao)!,
      },
    });
    municipioIdPorNome.set(m.nome, municipio.id);
    municipioPopPorNome.set(m.nome, m.populacao);
    municipioPoloPorNome.set(m.nome, m.polo);
  }
  console.info(`[seed] ${MUNICIPIOS.length} municipios / ${REGIOES.length} regioes de saude`);

  // ---------------------------------------------------------------------
  // 3. GrupoCid - MVP: uma unica linha (C00-C97)
  // ---------------------------------------------------------------------
  const grupoCid = await prisma.grupoCid.upsert({
    where: {
      codigoCidInicio_codigoCidFim_agrupamento: {
        codigoCidInicio: 'C00',
        codigoCidFim: 'C97',
        agrupamento: 'TODAS_NEOPLASIAS_MALIGNAS',
      },
    },
    update: {},
    create: {
      codigoCidInicio: 'C00',
      codigoCidFim: 'C97',
      nome: 'Neoplasias malignas (C00-C97)',
      agrupamento: 'TODAS_NEOPLASIAS_MALIGNAS',
      capitulo: 'II - Neoplasias (C00-D48)',
      ativo: true,
    },
  });

  // ---------------------------------------------------------------------
  // 4. Competencia
  // ---------------------------------------------------------------------
  const competenciaIdPorMes = new Map<number, number>();
  for (const c of COMPETENCIAS) {
    const competencia = await prisma.competencia.upsert({
      where: { ano_mes: { ano: c.ano, mes: c.mes } },
      update: { diasNoMes: c.dias },
      create: {
        ano: c.ano,
        mes: c.mes,
        dataRef: new Date(Date.UTC(c.ano, c.mes - 1, 1)),
        diasNoMes: c.dias,
      },
    });
    competenciaIdPorMes.set(c.mes, competencia.id);
  }
  console.info(`[seed] ${COMPETENCIAS.length} competencias (${COMPETENCIAS[0]!.ano})`);

  // ---------------------------------------------------------------------
  // 5. RiskConfig - so estrutura, sem pesos (nao implementar calculo/pesos
  //    nesta fase, conforme instrucao explicita).
  // ---------------------------------------------------------------------
  const riskConfigExistente = await prisma.riskConfig.findFirst({
    where: { autor: 'seed-fase1' },
  });
  if (!riskConfigExistente) {
    const riskConfig = await prisma.riskConfig.create({
      data: {
        metodoNormalizacao: 'NAO_DEFINIDO_FASE2',
        limiarVolumeMinimo: 30,
        vigenciaInicio: new Date('2025-01-01T00:00:00Z'),
        oficial: false,
        autor: 'seed-fase1',
        notaVersao:
          'Estrutura criada na Fase 1 apenas para validar o schema versionado do Radar. ' +
          'Nenhum peso foi definido (RiskConfigComponente permanece vazia). Metodo de ' +
          'normalizacao, pesos e componentes efetivos entram na Fase 2, conforme ' +
          'docs/risk-methodology.md.',
      },
    });
    console.info(`[seed] RiskConfig estrutural criado: id=${riskConfig.id} (oficial=false, sem pesos)`);
  } else {
    console.info(`[seed] RiskConfig estrutural ja existia: id=${riskConfigExistente.id}`);
  }

  // ---------------------------------------------------------------------
  // 5b. RiskConfig da Fase 2 - DEMO/provisorias, com pesos.
  //
  // docs/risk-methodology.md nao define valores de peso ("os numeros do
  // material de origem sao demonstrativos, nao oficiais"; "pesos iniciais
  // serao arbitrarios ate calibracao"). Por isso os 4 componentes recebem
  // peso IGUAL (0.25 cada) - a unica distribuicao que nao expressa nenhum
  // julgamento de importancia relativa entre eles, so uma estrutura minima
  // para o motor ter uma config explicita para operar. NAO e uma
  // metodologia oficial.
  //
  // Duas configs, variando so `limiarVolumeMinimo` (confiabilidade), para
  // demonstrar versionamento/reprodutibilidade: recalcular com outra config
  // cria linhas novas em RiskComponenteValor/RiskScore, nunca sobrescreve.
  // ---------------------------------------------------------------------
  const PESO_IGUAL = 0.25;
  const riskConfigsFase2 = [
    { autor: 'seed-fase2-a', limiarVolumeMinimo: 30 },
    { autor: 'seed-fase2-b', limiarVolumeMinimo: 100 },
  ];
  const riskConfigIds: number[] = [];
  for (const cfg of riskConfigsFase2) {
    let riskConfig = await prisma.riskConfig.findFirst({ where: { autor: cfg.autor } });
    if (!riskConfig) {
      riskConfig = await prisma.riskConfig.create({
        data: {
          metodoNormalizacao: 'PERCENTIL_COORTE',
          limiarVolumeMinimo: cfg.limiarVolumeMinimo,
          vigenciaInicio: new Date('2025-01-01T00:00:00Z'),
          oficial: false,
          autor: cfg.autor,
          notaVersao:
            'Config DEMO/provisoria da Fase 2. Pesos iguais (0.25 por componente) por nao haver ' +
            'valores oficiais documentados em risk-methodology.md - nao representa julgamento de ' +
            'importancia relativa entre componentes. limiarVolumeMinimo = ' +
            `${cfg.limiarVolumeMinimo} (variado entre as duas configs desta fase para demonstrar ` +
            'que o versionamento produz historico distinto, nunca sobrescreve).',
        },
      });
      for (const componente of [
        'PRESSAO_HOSPITALAR_ESTIMADA',
        'TENDENCIA',
        'SEVERIDADE',
        'VULNERABILIDADE',
      ] as const) {
        await prisma.riskConfigComponente.create({
          data: { riskConfigId: riskConfig.id, componente, peso: PESO_IGUAL, ativo: true },
        });
      }
      console.info(`[seed] RiskConfig Fase 2 criada: id=${riskConfig.id} (${cfg.autor})`);
    } else {
      console.info(`[seed] RiskConfig Fase 2 ja existia: id=${riskConfig.id} (${cfg.autor})`);
    }
    riskConfigIds.push(riskConfig.id);
  }

  // ---------------------------------------------------------------------
  // 5c. IndicadorDefinicao da taxa de internacao por 10.000 habitantes -
  // o indicador OBSERVADO que fundamenta TENDENCIA (docs/risk-methodology.md
  // #2.2), materializado como IndicadorMunicipal. A "variacao em janela
  // movel com sazonalidade" continua indisponivel (ver packages/risk/src/
  // components/tendencia.ts) - so a taxa em si e calculada.
  // ---------------------------------------------------------------------
  await prisma.indicadorDefinicao.upsert({
    where: { chave: 'TAXA_INTERNACAO_10K_HAB' },
    update: {},
    create: {
      chave: 'TAXA_INTERNACAO_10K_HAB',
      nome: 'Taxa de internacoes oncologicas por 10.000 habitantes',
      fonte: 'Derivado de FatoInternacaoResidencia + Populacao',
      unidade: 'por 10.000 habitantes',
      periodicidade: 'MENSAL',
      direcao: 'MAIOR_PIOR',
      eixoTerritorial: 'RESIDENCIA',
      naturezaPadrao: 'OBSERVADO',
      notaMetodologica:
        'Componente observado de TENDENCIA (risk-methodology.md #2.2). Representa apenas a taxa ' +
        'bruta - a variacao em janela movel com tratamento de sazonalidade que definiria o ' +
        'componente TENDENCIA do Radar continua indisponivel por falta de definicao metodologica.',
      ativo: true,
    },
  });

  // ---------------------------------------------------------------------
  // 6. Populacao (ano = primeira competencia)
  // ---------------------------------------------------------------------
  const ano = COMPETENCIAS[0]!.ano;
  let populacaoRows = 0;
  for (const m of MUNICIPIOS) {
    const municipioId = municipioIdPorNome.get(m.nome)!;
    for (const faixa of FAIXAS) {
      for (const sexo of SEXOS) {
        const fracaoSexo = 0.5 * jitter(0.9, 1.1);
        const populacaoCelula = Math.max(0, Math.round(m.populacao * FRACAO_FAIXA[faixa] * fracaoSexo));
        await prisma.populacao.upsert({
          where: {
            municipioId_ano_faixaEtaria_sexo: { municipioId, ano, faixaEtaria: faixa, sexo },
          },
          update: { populacao: populacaoCelula },
          create: {
            municipioId,
            ano,
            faixaEtaria: faixa,
            sexo,
            populacao: populacaoCelula,
            origem: 'DEMO',
            execucaoId: execucaoRef.id,
          },
        });
        populacaoRows += 1;
      }
    }
  }
  console.info(`[seed] Populacao: ${populacaoRows} linhas`);

  // ---------------------------------------------------------------------
  // 7. Fatos por competencia (uma IngestaoExecucao por mes, como um pipeline
  //    mensal real faria)
  // ---------------------------------------------------------------------
  let residenciaRows = 0;
  let residenciaSuprimidas = 0;
  let localRows = 0;
  let localSuprimidas = 0;
  let leitosRows = 0;

  for (const c of COMPETENCIAS) {
    const competenciaId = competenciaIdPorMes.get(c.mes)!;

    const execucaoMes = await prisma.ingestaoExecucao.upsert({
      where: { id: `demo-execucao-fatos-${c.ano}-${String(c.mes).padStart(2, '0')}` },
      update: {},
      create: {
        id: `demo-execucao-fatos-${c.ano}-${String(c.mes).padStart(2, '0')}`,
        fonteDadosId: 'GERADOR_DEMO',
        competenciaId,
        status: 'SUCESSO',
        hashInsumos: `seed:${SEED_DETERMINISTICO}:${c.ano}-${c.mes}`,
        versaoPipeline: VERSAO_SEED,
        iniciadoEm: new Date(Date.UTC(c.ano, c.mes - 1, 1)),
        finalizadoEm: new Date(Date.UTC(c.ano, c.mes - 1, 1, 0, 5)),
      },
    });

    for (const m of MUNICIPIOS) {
      const municipioId = municipioIdPorNome.get(m.nome)!;
      const populacaoTotal = municipioPopPorNome.get(m.nome)!;
      const polo = municipioPoloPorNome.get(m.nome)!;

      // --- FatoInternacaoResidencia + FatoInternacaoLocal ---
      const tarefasFato: Promise<unknown>[] = [];
      for (const faixa of FAIXAS) {
        for (const sexo of SEXOS) {
          const populacaoCelula = Math.max(
            0,
            Math.round(populacaoTotal * FRACAO_FAIXA[faixa] * 0.5),
          );

          const esperadoResidencia =
            populacaoCelula * INCIDENCIA_BASE_MENSAL * PESO_INCIDENCIA[faixa];
          const internacoesResidencia = Math.max(
            0,
            Math.round(esperadoResidencia * jitter(0.6, 1.4)),
          );
          const suprimidoResidencia = internacoesResidencia < LIMIAR_SUPRESSAO;
          if (suprimidoResidencia) residenciaSuprimidas += 1;

          tarefasFato.push(
            prisma.fatoInternacaoResidencia.upsert({
              where: {
                municipioResidenciaId_competenciaId_grupoCidId_faixaEtaria_sexo: {
                  municipioResidenciaId: municipioId,
                  competenciaId,
                  grupoCidId: grupoCid.id,
                  faixaEtaria: faixa,
                  sexo,
                },
              },
              update: {},
              create: {
                municipioResidenciaId: municipioId,
                competenciaId,
                grupoCidId: grupoCid.id,
                faixaEtaria: faixa,
                sexo,
                suprimido: suprimidoResidencia,
                internacoes: suprimidoResidencia ? null : internacoesResidencia,
                obitos: suprimidoResidencia
                  ? null
                  : Math.min(
                      internacoesResidencia,
                      Math.round(internacoesResidencia * jitter(0.03, 0.1)),
                    ),
                diasPermanencia: suprimidoResidencia
                  ? null
                  : Math.round(internacoesResidencia * jitter(5, 12)),
                origem: 'DEMO',
                execucaoId: execucaoMes.id,
              },
            }),
          );

          const fatorLocal = polo ? jitter(1.3, 1.7) : jitter(0.3, 0.7);
          const internacoesLocal = Math.max(
            0,
            Math.round(internacoesResidencia * fatorLocal),
          );
          const suprimidoLocal = internacoesLocal < LIMIAR_SUPRESSAO;
          if (suprimidoLocal) localSuprimidas += 1;
          const diasPermanenciaLocal = suprimidoLocal
            ? 0
            : Math.round(internacoesLocal * jitter(5, 12));

          tarefasFato.push(
            prisma.fatoInternacaoLocal.upsert({
              where: {
                municipioInternacaoId_competenciaId_grupoCidId_faixaEtaria_sexo: {
                  municipioInternacaoId: municipioId,
                  competenciaId,
                  grupoCidId: grupoCid.id,
                  faixaEtaria: faixa,
                  sexo,
                },
              },
              update: {},
              create: {
                municipioInternacaoId: municipioId,
                competenciaId,
                grupoCidId: grupoCid.id,
                faixaEtaria: faixa,
                sexo,
                suprimido: suprimidoLocal,
                internacoes: suprimidoLocal ? null : internacoesLocal,
                obitos: suprimidoLocal
                  ? null
                  : Math.min(internacoesLocal, Math.round(internacoesLocal * jitter(0.03, 0.1))),
                pacientesDia: suprimidoLocal ? null : diasPermanenciaLocal,
                diariasUti: suprimidoLocal
                  ? null
                  : Math.round(diasPermanenciaLocal * jitter(0.1, 0.3)),
                origem: 'DEMO',
                execucaoId: execucaoMes.id,
              },
            }),
          );
        }
      }
      const resultados = await Promise.all(tarefasFato);
      residenciaRows += resultados.length / 2;
      localRows += resultados.length / 2;

      // --- FatoCapacidadeLeitos ---
      const baseLeitos = Math.round((populacaoTotal / 1000) * jitter(0.8, 1.2));
      const tarefasLeitos = TIPOS_LEITO.map((tipoLeito) => {
        const leitosSus = Math.max(0, Math.round(baseLeitos * FRACAO_LEITO[tipoLeito]));
        const leitosTotais = Math.round(leitosSus * jitter(1.1, 1.4));
        return prisma.fatoCapacidadeLeitos.upsert({
          where: {
            municipioInternacaoId_competenciaId_tipoLeito: {
              municipioInternacaoId: municipioId,
              competenciaId,
              tipoLeito,
            },
          },
          update: {},
          create: {
            municipioInternacaoId: municipioId,
            competenciaId,
            tipoLeito,
            leitosSus,
            leitosTotais,
            origem: 'DEMO',
            execucaoId: execucaoMes.id,
          },
        });
      });
      await Promise.all(tarefasLeitos);
      leitosRows += tarefasLeitos.length;
    }
    console.info(`[seed] competencia ${c.ano}-${String(c.mes).padStart(2, '0')} processada`);
  }

  console.info('[seed] resumo:');
  console.info(`  FatoInternacaoResidencia: ${residenciaRows} linhas (${residenciaSuprimidas} suprimidas)`);
  console.info(`  FatoInternacaoLocal: ${localRows} linhas (${localSuprimidas} suprimidas)`);
  console.info(`  FatoCapacidadeLeitos: ${leitosRows} linhas`);
  console.info(`  RiskConfig da Fase 2 (DEMO, pesos iguais): ${riskConfigIds.join(', ')}`);
  console.info('[seed] concluido com sucesso.');
}

run()
  .then(async () => {
    await disconnectPrisma();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error('[seed] falhou:', error);
    await disconnectPrisma();
    process.exit(1);
  });
