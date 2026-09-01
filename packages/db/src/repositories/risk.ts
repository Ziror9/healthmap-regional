/**
 * Repositorio de leitura/escrita para o motor de risco (Fase 2).
 *
 * Unico lugar do projeto que sabe como os dados gold se transformam nos
 * insumos que packages/risk espera, e como os resultados de packages/risk
 * viram linhas de RiskComponenteValor/RiskScore. Nenhuma logica de calculo
 * mora aqui - so leitura, agregacao ciente de supressao, e escrita.
 */
import type { PrismaClient } from '@prisma/client';

export interface MunicipioRef {
  id: number;
  nome: string;
}

export interface CompetenciaRef {
  id: number;
  ano: number;
  mes: number;
  diasNoMes: number;
}

export interface RiskConfigComponenteRef {
  componente: 'PRESSAO_HOSPITALAR_ESTIMADA' | 'TENDENCIA' | 'SEVERIDADE' | 'VULNERABILIDADE';
  peso: number;
  indicadorDefinicaoId: string | null;
}

export interface RiskConfigRef {
  id: number;
  limiarVolumeMinimo: number;
  componentes: RiskConfigComponenteRef[];
}

/**
 * Agregado por municipio de internacao numa competencia, ja aplicando a
 * regra de supressao: se QUALQUER celula (faixa x sexo) contribuinte
 * estiver suprimida, o agregado inteiro vem null - nunca a soma parcial das
 * celulas visiveis (isso subestimaria o total silenciosamente). `bool_or`
 * no SQL e o que garante essa regra sem carregar cada celula pra memoria.
 */
export interface AgregadoInternacaoLocal {
  municipioId: number;
  pacientesDia: number | null;
  internacoesTotal: number | null;
}

export interface AgregadoInternacaoResidencia {
  municipioId: number;
  internacoesTotal: number | null;
}

export interface AgregadoCapacidadeLeitos {
  municipioId: number;
  leitosSusTotal: number;
}

export interface AgregadoPopulacao {
  municipioId: number;
  populacaoTotal: number;
}

/** Mesmo formato de AgregadoPopulacao, mas lido de PopulacaoEstimada (ver comentario no schema). */
export interface AgregadoPopulacaoEstimada {
  municipioId: number;
  populacaoTotal: number;
}

export async function getMunicipios(
  prisma: PrismaClient,
  opcoes?: { apenasDemo?: boolean; apenasReal?: boolean },
): Promise<MunicipioRef[]> {
  // Municipio nao tem coluna "origem" (so os fatos tem) - a distincao usa o
  // prefixo do codigoIbge7 estabelecido pelo seed DEMO (36xxxxx) vs a
  // geografia REAL do IBGE (35xxxxx, Fase 5), ver seed-demo.ts. Necessario
  // para que calculate-risk-demo.ts continue calculando so sobre a base
  // DEMO depois que a geografia REAL (645 municipios) passou a coexistir na
  // mesma tabela - sem isso o script processaria 43x mais municipios, e
  // pior, gravaria RiskScore/RiskComponenteValor com origem 'DEMO' para
  // municipios REAIS que nunca fizeram parte do seed. `apenasReal` e o
  // inverso, usado por calculate-indicadores-real.ts (Fase 5.2).
  const where = opcoes?.apenasDemo
    ? { codigoIbge7: { startsWith: '36' } }
    : opcoes?.apenasReal
      ? { codigoIbge7: { startsWith: '35' } }
      : undefined;
  return prisma.municipio.findMany({
    select: { id: true, nome: true },
    where,
    orderBy: { id: 'asc' },
  });
}

export async function getCompetencias(
  prisma: PrismaClient,
  opcoes?: { apenasDemo?: boolean; apenasReal?: boolean },
): Promise<CompetenciaRef[]> {
  // Mesmo raciocinio de getMunicipios({apenasDemo}) acima: Competencia e
  // dimensao compartilhada, sem coluna origem propria - desde a Fase 5, ela
  // tambem acumula competencias criadas so por ingestao REAL (snapshot do
  // CNES, meses do SIH), que nunca tiveram fato DEMO nenhum. Sem este
  // filtro, calculate-risk-demo.ts (que cruza TODAS as competencias da
  // tabela com os municipios DEMO) grava RiskComponenteValor com
  // origem='DEMO' para competencias inteiramente REAL - achado e corrigido
  // na Fase 5.1 (pacientes-dia/leitos dessas competencias nunca existiram
  // para municipio DEMO nenhum, entao os registros ficariam sempre
  // disponivel=false, mas ainda seriam linhas erradas no banco). `apenasReal`
  // e o inverso, usado por calculate-indicadores-real.ts (Fase 5.2).
  const where = opcoes?.apenasDemo
    ? {
        OR: [
          { fatosInternacaoResidencia: { some: { origem: 'DEMO' as const } } },
          { fatosInternacaoLocal: { some: { origem: 'DEMO' as const } } },
        ],
      }
    : opcoes?.apenasReal
      ? {
          OR: [
            { fatosInternacaoResidencia: { some: { origem: 'REAL' as const } } },
            { fatosInternacaoLocal: { some: { origem: 'REAL' as const } } },
          ],
        }
      : undefined;
  return prisma.competencia.findMany({
    select: { id: true, ano: true, mes: true, diasNoMes: true },
    where,
    orderBy: { dataRef: 'asc' },
  });
}

export async function getRiskConfigsFase2(prisma: PrismaClient): Promise<RiskConfigRef[]> {
  const configs = await prisma.riskConfig.findMany({
    where: { componentes: { some: {} } },
    include: { componentes: { where: { ativo: true } } },
    orderBy: { id: 'asc' },
  });
  return configs.map((c) => ({
    id: c.id,
    limiarVolumeMinimo: c.limiarVolumeMinimo,
    componentes: c.componentes.map((comp) => ({
      componente: comp.componente,
      peso: Number(comp.peso),
      indicadorDefinicaoId: comp.indicadorDefinicaoId,
    })),
  }));
}

export async function getAgregadoInternacaoLocal(
  prisma: PrismaClient,
  competenciaId: number,
): Promise<AgregadoInternacaoLocal[]> {
  const linhas = await prisma.$queryRaw<
    { municipioId: number; pacientesDia: bigint | null; internacoesTotal: bigint | null }[]
  >`
    SELECT
      "municipioInternacaoId" AS "municipioId",
      CASE WHEN bool_or(suprimido) THEN NULL ELSE SUM("pacientesDia") END AS "pacientesDia",
      CASE WHEN bool_or(suprimido) THEN NULL ELSE SUM(internacoes) END AS "internacoesTotal"
    FROM gold."FatoInternacaoLocal"
    WHERE "competenciaId" = ${competenciaId}
    GROUP BY "municipioInternacaoId"
  `;
  return linhas.map((l) => ({
    municipioId: l.municipioId,
    pacientesDia: l.pacientesDia === null ? null : Number(l.pacientesDia),
    internacoesTotal: l.internacoesTotal === null ? null : Number(l.internacoesTotal),
  }));
}

export async function getAgregadoInternacaoResidencia(
  prisma: PrismaClient,
  competenciaId: number,
): Promise<AgregadoInternacaoResidencia[]> {
  const linhas = await prisma.$queryRaw<{ municipioId: number; internacoesTotal: bigint | null }[]>`
    SELECT
      "municipioResidenciaId" AS "municipioId",
      CASE WHEN bool_or(suprimido) THEN NULL ELSE SUM(internacoes) END AS "internacoesTotal"
    FROM gold."FatoInternacaoResidencia"
    WHERE "competenciaId" = ${competenciaId}
    GROUP BY "municipioResidenciaId"
  `;
  return linhas.map((l) => ({
    municipioId: l.municipioId,
    internacoesTotal: l.internacoesTotal === null ? null : Number(l.internacoesTotal),
  }));
}

/**
 * Mesma agregacao acima, mas somando TODAS as competencias de um ano de
 * uma vez - necessario porque IndicadorMunicipal tem grao anual
 * (municipioId + ano + indicadorDefinicaoId, ver @@unique no schema),
 * diferente de FatoInternacaoResidencia, que e mensal. Calcular a taxa por
 * competencia e gravar em IndicadorMunicipal sobrescreveria silenciosamente
 * o mes anterior a cada nova competencia processada - por isso a agregacao
 * precisa acontecer no grao certo ANTES de persistir, nao depois.
 * `bool_or(suprimido)` continua valendo por municipio, agora sobre todas as
 * celulas do ano inteiro: uma unica celula suprimida em qualquer mes torna
 * o total anual do municipio indisponivel (mesma regra de NULL != 0).
 */
export async function getAgregadoInternacaoResidenciaAnual(
  prisma: PrismaClient,
  ano: number,
): Promise<AgregadoInternacaoResidencia[]> {
  const linhas = await prisma.$queryRaw<{ municipioId: number; internacoesTotal: bigint | null }[]>`
    SELECT
      f."municipioResidenciaId" AS "municipioId",
      CASE WHEN bool_or(f.suprimido) THEN NULL ELSE SUM(f.internacoes) END AS "internacoesTotal"
    FROM gold."FatoInternacaoResidencia" f
    JOIN silver."Competencia" c ON c.id = f."competenciaId"
    WHERE c.ano = ${ano}
    GROUP BY f."municipioResidenciaId"
  `;
  return linhas.map((l) => ({
    municipioId: l.municipioId,
    internacoesTotal: l.internacoesTotal === null ? null : Number(l.internacoesTotal),
  }));
}

export async function getAgregadoCapacidadeLeitos(
  prisma: PrismaClient,
  competenciaId: number,
): Promise<AgregadoCapacidadeLeitos[]> {
  const linhas = await prisma.fatoCapacidadeLeitos.groupBy({
    by: ['municipioInternacaoId'],
    where: { competenciaId },
    _sum: { leitosSus: true },
  });
  return linhas.map((l) => ({
    municipioId: l.municipioInternacaoId,
    leitosSusTotal: l._sum.leitosSus ?? 0,
  }));
}

export async function getAgregadoPopulacao(prisma: PrismaClient, ano: number): Promise<AgregadoPopulacao[]> {
  const linhas = await prisma.populacao.groupBy({
    by: ['municipioId'],
    where: { ano },
    _sum: { populacao: true },
  });
  return linhas.map((l) => ({ municipioId: l.municipioId, populacaoTotal: l._sum.populacao ?? 0 }));
}

/**
 * Le PopulacaoEstimada (Fase 5.2) - total anual por municipio, sem quebra
 * etaria/sexo (ver comentario no schema). Usada como denominador REAL de
 * TAXA_INTERNACAO_10K_HAB para anos nao-censitarios, onde Populacao (Censo)
 * nao tem linha.
 */
export async function getAgregadoPopulacaoEstimada(prisma: PrismaClient, ano: number): Promise<AgregadoPopulacaoEstimada[]> {
  const linhas = await prisma.populacaoEstimada.groupBy({
    by: ['municipioId'],
    where: { ano },
    _sum: { populacaoTotal: true },
  });
  return linhas.map((l) => ({ municipioId: l.municipioId, populacaoTotal: l._sum.populacaoTotal ?? 0 }));
}

// -----------------------------------------------------------------------------
// Grao REGIONAL (Fase 5.5) - le as tabelas *Regional, gravadas pelos proprios
// ingest_sih.py/ingest_cnes_historico.py com supressao independente (nunca
// derivadas dos fatos municipais ja suprimidos - ver schema.prisma). O motor
// de packages/risk e o mesmo; so o insumo (regiao em vez de municipio) muda.
// -----------------------------------------------------------------------------

export interface RegiaoRef {
  id: number;
  nome: string;
}

export async function getRegioes(prisma: PrismaClient): Promise<RegiaoRef[]> {
  return prisma.regiaoSaude.findMany({ select: { id: true, nome: true }, orderBy: { id: 'asc' } });
}

export interface AgregadoInternacaoLocalRegional {
  regiaoSaudeId: number;
  pacientesDia: number | null;
  internacoesTotal: number | null;
}

export async function getAgregadoInternacaoLocalRegional(
  prisma: PrismaClient,
  competenciaId: number,
): Promise<AgregadoInternacaoLocalRegional[]> {
  const linhas = await prisma.$queryRaw<
    { regiaoSaudeId: number; pacientesDia: bigint | null; internacoesTotal: bigint | null }[]
  >`
    SELECT
      "regiaoSaudeInternacaoId" AS "regiaoSaudeId",
      CASE WHEN bool_or(suprimido) THEN NULL ELSE SUM("pacientesDia") END AS "pacientesDia",
      CASE WHEN bool_or(suprimido) THEN NULL ELSE SUM(internacoes) END AS "internacoesTotal"
    FROM gold."FatoInternacaoLocalRegional"
    WHERE "competenciaId" = ${competenciaId}
    GROUP BY "regiaoSaudeInternacaoId"
  `;
  return linhas.map((l) => ({
    regiaoSaudeId: l.regiaoSaudeId,
    pacientesDia: l.pacientesDia === null ? null : Number(l.pacientesDia),
    internacoesTotal: l.internacoesTotal === null ? null : Number(l.internacoesTotal),
  }));
}

export interface AgregadoCapacidadeLeitosRegional {
  regiaoSaudeId: number;
  leitosSusTotal: number;
}

export async function getAgregadoCapacidadeLeitosRegional(
  prisma: PrismaClient,
  competenciaId: number,
): Promise<AgregadoCapacidadeLeitosRegional[]> {
  const linhas = await prisma.fatoCapacidadeLeitosRegional.groupBy({
    by: ['regiaoSaudeInternacaoId'],
    where: { competenciaId },
    _sum: { leitosSus: true },
  });
  return linhas.map((l) => ({
    regiaoSaudeId: l.regiaoSaudeInternacaoId,
    leitosSusTotal: l._sum.leitosSus ?? 0,
  }));
}

export interface IndicadorRegionalPorDefinicao {
  regiaoSaudeId: number;
  valor: number;
  denominador: number | null;
}

/**
 * Media ponderada (pelo denominador municipal) do IndicadorMunicipal de uma
 * definicao+ano, agrupada por RegiaoSaude do municipio - mesmo raciocinio de
 * segundo nivel de agregacao ja usado por etl/ingest_vulnerabilidade.py
 * (setor -> municipio), agora municipio -> regiao. So entra municipio com
 * denominador > 0 (peso conhecido); nunca inventa peso para quem nao tem.
 */
export async function getIndicadorRegionalPorDefinicao(
  prisma: PrismaClient,
  opcoes: { indicadorDefinicaoId: string; ano: number },
): Promise<IndicadorRegionalPorDefinicao[]> {
  const linhas = await prisma.$queryRaw<{ regiaoSaudeId: number; valor: number; denominador: bigint | number }[]>`
    SELECT
      m."regiaoSaudeId" AS "regiaoSaudeId",
      SUM(im.valor * im.denominador) / SUM(im.denominador) AS valor,
      SUM(im.denominador) AS denominador
    FROM gold."IndicadorMunicipal" im
    JOIN silver."Municipio" m ON m.id = im."municipioId"
    WHERE im."indicadorDefinicaoId" = ${opcoes.indicadorDefinicaoId}
      AND im.ano = ${opcoes.ano}
      AND im.denominador IS NOT NULL
      AND im.denominador > 0
    GROUP BY m."regiaoSaudeId"
  `;
  return linhas.map((l) => ({
    regiaoSaudeId: l.regiaoSaudeId,
    valor: Number(l.valor),
    denominador: Number(l.denominador),
  }));
}

export interface RiskComponenteValorRegionalInput {
  regiaoSaudeId: number;
  competenciaId: number;
  riskConfigId: number;
  componente: 'PRESSAO_HOSPITALAR_ESTIMADA' | 'TENDENCIA' | 'SEVERIDADE' | 'VULNERABILIDADE';
  valorBruto: number | null;
  valorNormalizado: number | null;
  natureza: 'OBSERVADO' | 'ESTIMATIVA' | 'PROJECAO';
  confiabilidade: 'ALTA' | 'MEDIA' | 'BAIXA';
  disponivel: boolean;
  origem: 'REAL' | 'DEMO';
}

export async function salvarRiskComponenteValorRegional(
  prisma: PrismaClient,
  input: RiskComponenteValorRegionalInput,
): Promise<void> {
  await prisma.riskComponenteValorRegional.upsert({
    where: {
      regiaoSaudeId_competenciaId_riskConfigId_componente: {
        regiaoSaudeId: input.regiaoSaudeId,
        competenciaId: input.competenciaId,
        riskConfigId: input.riskConfigId,
        componente: input.componente,
      },
    },
    update: {
      valorBruto: input.valorBruto,
      valorNormalizado: input.valorNormalizado,
      natureza: input.natureza,
      confiabilidade: input.confiabilidade,
      disponivel: input.disponivel,
      origem: input.origem,
    },
    create: input,
  });
}

export interface RiskScoreRegionalInput {
  regiaoSaudeId: number;
  competenciaId: number;
  riskConfigId: number;
  indice: number;
  classificacao: 'CRITICO' | 'ALTO' | 'MEDIO' | 'BAIXO' | 'MUITO_BAIXO';
  confiabilidade: 'ALTA' | 'MEDIA' | 'BAIXA';
  natureza: 'OBSERVADO' | 'ESTIMATIVA' | 'PROJECAO';
  origem: 'REAL' | 'DEMO';
}

export async function salvarRiskScoreRegional(prisma: PrismaClient, input: RiskScoreRegionalInput): Promise<void> {
  await prisma.riskScoreRegional.upsert({
    where: {
      regiaoSaudeId_competenciaId_riskConfigId: {
        regiaoSaudeId: input.regiaoSaudeId,
        competenciaId: input.competenciaId,
        riskConfigId: input.riskConfigId,
      },
    },
    update: {
      indice: input.indice,
      classificacao: input.classificacao,
      confiabilidade: input.confiabilidade,
      natureza: input.natureza,
      origem: input.origem,
    },
    create: input,
  });
}

export interface RiskComponenteValorInput {
  municipioId: number;
  competenciaId: number;
  riskConfigId: number;
  componente: 'PRESSAO_HOSPITALAR_ESTIMADA' | 'TENDENCIA' | 'SEVERIDADE' | 'VULNERABILIDADE';
  valorBruto: number | null;
  valorNormalizado: number | null;
  natureza: 'OBSERVADO' | 'ESTIMATIVA' | 'PROJECAO';
  confiabilidade: 'ALTA' | 'MEDIA' | 'BAIXA';
  disponivel: boolean;
  origem: 'REAL' | 'DEMO';
}

/** Upsert sobre a chave de grao - idempotente: reexecutar o calculo para a mesma celula converge, nao duplica. */
export async function salvarRiskComponenteValor(prisma: PrismaClient, input: RiskComponenteValorInput): Promise<void> {
  await prisma.riskComponenteValor.upsert({
    where: {
      municipioId_competenciaId_riskConfigId_componente: {
        municipioId: input.municipioId,
        competenciaId: input.competenciaId,
        riskConfigId: input.riskConfigId,
        componente: input.componente,
      },
    },
    update: {
      valorBruto: input.valorBruto,
      valorNormalizado: input.valorNormalizado,
      natureza: input.natureza,
      confiabilidade: input.confiabilidade,
      disponivel: input.disponivel,
      origem: input.origem,
    },
    create: input,
  });
}

export interface RiskScoreInput {
  municipioId: number;
  competenciaId: number;
  riskConfigId: number;
  indice: number;
  classificacao: 'CRITICO' | 'ALTO' | 'MEDIO' | 'BAIXO' | 'MUITO_BAIXO';
  confiabilidade: 'ALTA' | 'MEDIA' | 'BAIXA';
  natureza: 'OBSERVADO' | 'ESTIMATIVA' | 'PROJECAO';
  origem: 'REAL' | 'DEMO';
}

export async function salvarRiskScore(prisma: PrismaClient, input: RiskScoreInput): Promise<void> {
  await prisma.riskScore.upsert({
    where: {
      municipioId_competenciaId_riskConfigId: {
        municipioId: input.municipioId,
        competenciaId: input.competenciaId,
        riskConfigId: input.riskConfigId,
      },
    },
    update: {
      indice: input.indice,
      classificacao: input.classificacao,
      confiabilidade: input.confiabilidade,
      natureza: input.natureza,
      origem: input.origem,
    },
    create: input,
  });
}

export interface IndicadorMunicipalPorDefinicao {
  municipioId: number;
  valor: number;
  denominador: number | null;
}

/**
 * Le todas as linhas de IndicadorMunicipal de uma definicao+ano - usado
 * para resolver o "valorIndicador" de um RiskConfigComponente que aponta
 * indicadorDefinicaoId (ex.: VULNERABILIDADE via IPVS, Fase 5.4). Nao filtra
 * por origem: o chamador ja opera sobre um subconjunto de municipios
 * (DEMO xor REAL, nunca ambos - ver getMunicipios) que nao compartilha id
 * com o outro subconjunto.
 */
export async function getIndicadorMunicipalPorDefinicao(
  prisma: PrismaClient,
  opcoes: { indicadorDefinicaoId: string; ano: number },
): Promise<IndicadorMunicipalPorDefinicao[]> {
  const linhas = await prisma.indicadorMunicipal.findMany({
    where: { indicadorDefinicaoId: opcoes.indicadorDefinicaoId, ano: opcoes.ano },
    select: { municipioId: true, valor: true, denominador: true },
  });
  return linhas.map((l) => ({
    municipioId: l.municipioId,
    valor: Number(l.valor),
    denominador: l.denominador === null ? null : Number(l.denominador),
  }));
}

export interface IndicadorMunicipalInput {
  municipioId: number;
  ano: number;
  indicadorDefinicaoId: string;
  valor: number;
  /** Denominador usado no calculo (ex. populacao) - auditabilidade, ver docs/data-model.md. Opcional: DEMO nunca gravou este campo ate a Fase 5.2. */
  denominador?: number;
  origem: 'REAL' | 'DEMO';
  execucaoId: string;
}

export async function salvarIndicadorMunicipal(prisma: PrismaClient, input: IndicadorMunicipalInput): Promise<void> {
  await prisma.indicadorMunicipal.upsert({
    where: {
      municipioId_ano_indicadorDefinicaoId: {
        municipioId: input.municipioId,
        ano: input.ano,
        indicadorDefinicaoId: input.indicadorDefinicaoId,
      },
    },
    update: { valor: input.valor, denominador: input.denominador ?? null, origem: input.origem, execucaoId: input.execucaoId },
    create: { ...input, denominador: input.denominador ?? null },
  });
}
