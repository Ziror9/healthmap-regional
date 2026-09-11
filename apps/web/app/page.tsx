'use client';

import type {
  ClassificacaoRisco,
  MunicipioResumoDTO,
  PoloAtendimentoDTO,
  RadarMunicipalItemDTO,
  RiskFiltroResolvidoDTO,
  RiskScoreItemDTO,
} from '@healthmap/contracts';
import { AlertTriangle, ArrowRight, Building2, HeartPulse, Network } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { MapaSP, type MunicipioNoMapa } from '@/components/charts/map';
import { FilterBar } from '@/components/domain/filter-bar';
import { FreshnessIndicator } from '@/components/domain/freshness-indicator';
import { KpiCard, PainelIndicadores } from '@/components/domain/kpi-card';
import { ProvenanceBadge } from '@/components/domain/provenance-badge';
import { RankBar } from '@/components/domain/rank-bar';
import { RegionDistribuicao, type RegiaoGrupo } from '@/components/domain/region-distribution';
import { RiskBadge } from '@/components/domain/risk-badge';
import { RiskScaleLegend } from '@/components/domain/risk-scale-legend';
import { PageContent } from '@/components/layout/page-content';
import { PageHeader } from '@/components/layout/page-header';
import { SectionHeader } from '@/components/layout/section-header';
import { EmptyState } from '@/components/states/empty-state';
import { ErrorState } from '@/components/states/error-state';
import { LoadingState } from '@/components/states/loading-state';
import { Card } from '@/components/ui/card';
import {
  ApiRequestError,
  getIndicadorMunicipios,
  getPolosAtendimento,
  getTodosMunicipios,
  getTodosRisk,
} from '@/lib/api';
import { formatCompetenciaLabel, formatIndice, formatNumero } from '@/lib/format';
import { inferOrigemMunicipio } from '@/lib/risk-display';
import { buildMunicipioHref, useRiskFiltersUrl } from '@/lib/use-risk-filters';

/**
 * Visao Geral - primeiro nivel da leitura: "o que esta acontecendo e onde?".
 *
 * Hierarquia (Fase 5.8): situacao geral (KPIs + alertas) -> analise
 * territorial (mapa, polos de atendimento, regioes) -> caminhos de
 * investigacao (links). Nenhum indice/taxa/fluxo e recalculado aqui: os KPIs
 * sao agregacao de APRESENTACAO (contagem, maximo, soma) sobre listas ja
 * materializadas pela API.
 */

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | {
      tipo: 'pronto';
      risco: RiskScoreItemDTO[];
      meta: RiskFiltroResolvidoDTO;
      municipios: MunicipioResumoDTO[];
      mortalidade: RadarMunicipalItemDTO[];
      mortalidadeAno: number | null;
      polos: PoloAtendimentoDTO[];
      polosAno: number | null;
    };

function DashboardContent() {
  const { filtros } = useRiskFiltersUrl();
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });

  useEffect(() => {
    let cancelado = false;
    setEstado({ tipo: 'carregando' });

    // A Visao Geral e a leitura de PRIMEIRO nivel: por padrao mostra a base
    // REAL (645 municipios), nao a DEMO (15 municipios ilustrativos). Sem
    // esse default a pagina abre na competencia DEMO mais recente - que e
    // posterior as competencias REAL - e o usuario ve 3 municipios
    // sinteticos como se fossem o panorama do estado. O filtro de origem
    // continua disponivel e sobrepoe esse default.
    const filtrosEfetivos = { ...filtros, origem: filtros.origem ?? ('REAL' as const) };

    Promise.all([
      getTodosRisk(filtrosEfetivos),
      getTodosMunicipios(),
      // Indicadores/fluxo tem grao ANUAL e nao dependem da competencia
      // selecionada - por isso nao recebem `filtros` (a API resolve o ano
      // mais recente disponivel para cada um).
      getIndicadorMunicipios({ indicador: 'TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB' }).catch(() => null),
      getPolosAtendimento({ limite: 6 }).catch(() => null),
    ])
      .then(([risco, municipios, mortalidade, polos]) => {
        if (cancelado) return;
        setEstado({
          tipo: 'pronto',
          risco: risco.data,
          meta: risco.meta.filtros,
          municipios,
          mortalidade: mortalidade?.data ?? [],
          mortalidadeAno: mortalidade?.meta.filtros.ano ?? null,
          polos: polos?.data ?? [],
          polosAno: polos?.meta.filtros.ano ?? null,
        });
      })
      .catch((erro: unknown) => {
        if (cancelado) return;
        const mensagem = erro instanceof ApiRequestError ? erro.message : 'Falha desconhecida ao consultar a API.';
        setEstado({ tipo: 'erro', mensagem });
      });

    return () => {
      cancelado = true;
    };
  }, [filtros.competenciaId, filtros.riskConfigId, filtros.origem]);

  return (
    <>
      <PageHeader
        title="Visão Geral"
        description="Onde está a maior pressão oncológica no território paulista."
        actions={<FilterBar />}
      />
      <PageContent>
        {estado.tipo === 'carregando' && (
          <div className="space-y-8">
            <LoadingState label="Carregando panorama..." variant="cards" />
            <LoadingState label="Carregando mapa e rankings..." variant="map" />
          </div>
        )}
        {estado.tipo === 'erro' && <ErrorState description={estado.mensagem} />}
        {estado.tipo === 'pronto' && <DashboardPronto estado={estado} />}
      </PageContent>
    </>
  );
}

function DashboardPronto({ estado }: { estado: Extract<Estado, { tipo: 'pronto' }> }) {
  const { risco, meta, municipios, mortalidade, mortalidadeAno, polos, polosAno } = estado;

  const kpis = useMemo(() => {
    const criticosOuAltos = risco.filter((i) => i.classificacao === 'CRITICO' || i.classificacao === 'ALTO').length;

    const mortalidadeDisponivel = mortalidade.filter(
      (i): i is RadarMunicipalItemDTO & { valor: number } => i.disponivel && i.valor !== null,
    );
    const maiorMortalidade = mortalidadeDisponivel.reduce<(RadarMunicipalItemDTO & { valor: number }) | null>(
      (maior, item) => (maior === null || item.valor > maior.valor ? item : maior),
      null,
    );

    const volumeTotalPolos = polos.reduce((total, p) => total + p.internacoesRecebidasDeFora, 0);
    const maiorPolo = polos[0] ?? null;

    return {
      criticosOuAltos,
      maiorMortalidade,
      mortalidadeCobertura: mortalidadeDisponivel.length,
      mortalidadeTotal: mortalidade.length,
      maiorPolo,
      volumeTotalPolos,
    };
  }, [risco, mortalidade, polos]);

  const regioes = useMemo<RegiaoGrupo[]>(() => {
    const riscoPorMunicipio = new Map(risco.map((item) => [item.municipio.id, item]));
    const grupos = new Map<number, RegiaoGrupo>();
    for (const municipio of municipios) {
      // Real-first (Fase 5.9): as 5 regioes "(ilustrativa)" do seed DEMO nao
      // entram na leitura regional do produto - misturadas com os 17 DRS
      // oficiais elas pareceriam mais uma regiao de saude qualquer.
      if (inferOrigemMunicipio(municipio.codigoIbge7) !== 'REAL') continue;
      const grupo = grupos.get(municipio.regiaoSaude.id) ?? {
        regiaoId: municipio.regiaoSaude.id,
        regiaoNome: municipio.regiaoSaude.nome,
        municipios: [],
      };
      grupo.municipios.push({
        id: municipio.id,
        nome: municipio.nome,
        classificacao: riscoPorMunicipio.get(municipio.id)?.classificacao ?? null,
      });
      grupos.set(municipio.regiaoSaude.id, grupo);
    }
    return [...grupos.values()].sort((a, b) => a.regiaoNome.localeCompare(b.regiaoNome));
  }, [risco, municipios]);

  const maisCriticos = useMemo(() => [...risco].sort((a, b) => b.indice - a.indice).slice(0, 6), [risco]);

  /**
   * Quantos municipios em cada faixa da escala - CONTAGEM dos itens que a API
   * ja devolveu classificados, para a legenda do mapa. Nenhum limiar ou
   * classificacao acontece aqui (mesma natureza dos KPIs de apresentacao).
   */
  const contagemPorClassificacao = useMemo(() => {
    const zerado: Record<ClassificacaoRisco, number> = { CRITICO: 0, ALTO: 0, MEDIO: 0, BAIXO: 0, MUITO_BAIXO: 0 };
    for (const item of risco) zerado[item.classificacao] += 1;
    return zerado;
  }, [risco]);

  const municipiosParaMapa = useMemo<MunicipioNoMapa[]>(() => {
    const riscoPorMunicipioId = new Map(risco.map((item) => [item.municipio.id, item]));
    // So municipios REAL: os DEMO nao tem geometria no GeoJSON oficial e
    // nunca apareceriam no mapa - manter na lista so criaria a impressao de
    // que fazem parte do territorio analisado.
    return municipios
      .filter((m) => inferOrigemMunicipio(m.codigoIbge7) === 'REAL')
      .map((m) => {
      const r = riscoPorMunicipioId.get(m.id);
      return {
        id: m.id,
        codigoIbge7: m.codigoIbge7,
        nome: m.nome,
        classificacao: r?.classificacao ?? null,
        indice: r?.indice ?? null,
      };
    });
  }, [risco, municipios]);

  const primeiroItem = risco[0];

  if (!primeiroItem) {
    return (
      <EmptyState
        title="Nenhum resultado do Radar para os filtros selecionados."
        description="A competência selecionada pode ser apenas geográfica/de capacidade (sem Radar calculado). Ajuste a competência no filtro acima."
      />
    );
  }

  const competenciaLabel = formatCompetenciaLabel(primeiroItem.competencia.ano, primeiroItem.competencia.mes);
  const realCount = municipios.filter((m) => inferOrigemMunicipio(m.codigoIbge7) === 'REAL').length;
  const hrefMunicipio = (municipioId: number) =>
    buildMunicipioHref(municipioId, {
      competenciaId: primeiroItem.competencia.id,
      riskConfigId: primeiroItem.riskConfigId,
      origem: meta.origem ?? undefined,
    });

  return (
    <div className="space-y-8">
      {/* ================= SITUACAO — o que esta acontecendo ================= */}
      <section className="space-y-3">
        <div className="flex flex-col gap-2 rounded-md border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body text-foreground">
            <span className="tabular font-semibold">{realCount}</span> municípios de São Paulo ·{' '}
            <span className="tabular font-semibold">{risco.length}</span> com índice em {competenciaLabel}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center text-label uppercase text-muted-foreground">
              Origem <ProvenanceBadge origem={meta.origem ?? primeiroItem.origem} className="mx-1.5 align-middle" />
            </span>
            <FreshnessIndicator competenciaLabel={competenciaLabel} calculadoEm={primeiroItem.calculadoEm} />
          </div>
        </div>

        <PainelIndicadores>
          <KpiCard
            label="Municípios em risco alto"
            value={formatNumero(kpis.criticosOuAltos)}
            icon={AlertTriangle}
            hint={`Crítico ou Alto, de ${risco.length} com índice`}
            fonte="Radar de Risco"
            periodo={competenciaLabel}
          />
          <KpiCard
            label="Maior mortalidade oncológica"
            value={kpis.maiorMortalidade ? formatNumero(kpis.maiorMortalidade.valor, 1) : '—'}
            unit={kpis.maiorMortalidade ? '/10 mil' : undefined}
            icon={HeartPulse}
            hint={kpis.maiorMortalidade ? kpis.maiorMortalidade.municipio.nome : 'Indicador indisponível'}
            fonte="SIM/DATASUS"
            periodo={mortalidadeAno ? String(mortalidadeAno) : '—'}
          />
          <KpiCard
            label="Maior polo de atendimento"
            value={kpis.maiorPolo ? kpis.maiorPolo.municipio.nome : '—'}
            icon={Network}
            hint={
              kpis.maiorPolo
                ? `${formatNumero(kpis.maiorPolo.internacoesRecebidasDeFora)} internações de ${kpis.maiorPolo.municipiosDeOrigem} municípios`
                : 'Fluxo assistencial não carregado'
            }
            fonte="SIH/SUS"
            periodo={polosAno ? String(polosAno) : '—'}
          />
          <KpiCard
            label="Cobertura da mortalidade"
            value={
              kpis.mortalidadeTotal > 0
                ? `${Math.round((kpis.mortalidadeCobertura / kpis.mortalidadeTotal) * 100)}%`
                : '—'
            }
            icon={Building2}
            hint={
              kpis.mortalidadeTotal > 0
                ? `${kpis.mortalidadeCobertura} de ${kpis.mortalidadeTotal} municípios · resto suprimido (n<5)`
                : 'Indicador indisponível'
            }
            fonte="SIM/DATASUS"
            periodo={mortalidadeAno ? String(mortalidadeAno) : '—'}
          />
        </PainelIndicadores>

        <p className="text-caption leading-relaxed text-muted-foreground">
          Tendência e Severidade continuam estruturalmente indisponíveis (metodologia não definida): o índice do Radar é
          composto apenas pelos componentes disponíveis, com os pesos renormalizados — ver{' '}
          <Link href="/metodologia" className="text-primary hover:underline">
            Metodologia
          </Link>
          . Os indicadores acima são contagem e máximo de apresentação sobre listas já calculadas pela API; nenhum índice
          é recalculado aqui.
        </p>
      </section>

      {/* ================= ANALISE — onde esta acontecendo ================= */}
      <section className="space-y-4">
        <SectionHeader
          title="Onde está acontecendo"
          description="Distribuição territorial do risco e concentração do atendimento"
        />

        {/* O mapa e o elemento dominante da pagina: ocupa a maior parte da
            largura, e as listas ficam ao lado como leitura de apoio. Antes as
            tres coisas dividiam espaco em pe de igualdade e nenhuma era o
            ponto focal. */}
        <div className="grid gap-5 xl:grid-cols-[1.7fr_1fr]">
          <div className="min-w-0 space-y-2">
            <h3 className="text-title-sm font-semibold text-foreground">Índice do Radar por município</h3>
            <MapaSP
              municipios={municipiosParaMapa}
              buildHref={hrefMunicipio}
              legenda={
                <RiskScaleLegend
                  contagemPorClassificacao={contagemPorClassificacao}
                  semDado={{
                    quantidade: municipiosParaMapa.filter((m) => m.classificacao === null).length,
                    motivo: 'sem índice nesta competência',
                  }}
                />
              }
            />
            <p className="text-caption text-muted-foreground">
              Clique em um município para investigar; use as setas para percorrer o mapa pelo teclado.{' '}
              <Link href="/radar-municipal" className="text-primary hover:underline">
                Ver o mapa por outros indicadores →
              </Link>
            </p>
          </div>

          <div className="min-w-0 space-y-5">
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-title-sm font-semibold text-foreground">Polos de atendimento</h3>
                <Link href="/fluxo" className="shrink-0 text-caption text-primary hover:underline">
                  Mapa de fluxo →
                </Link>
              </div>
              <p className="mb-1.5 text-caption text-muted-foreground">
                Quem mais recebe pacientes de fora{polosAno ? ` · SIH/SUS ${polosAno}` : ''}
              </p>
              {polos.length === 0 ? (
                <EmptyState title="Fluxo assistencial não carregado." className="py-6" />
              ) : (
                <div className="space-y-0.5">
                  {polos.map((polo, indice) => (
                    <RankBar
                      key={polo.municipio.id}
                      posicao={indice + 1}
                      nome={polo.municipio.nome}
                      contexto={`de ${polo.municipiosDeOrigem} municípios`}
                      valor={polo.internacoesRecebidasDeFora}
                      valorFormatado={formatNumero(polo.internacoesRecebidasDeFora)}
                      maximo={kpis.maiorPolo?.internacoesRecebidasDeFora ?? 0}
                      href={hrefMunicipio(polo.municipio.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-title-sm font-semibold text-foreground">Municípios em maior atenção</h3>
              <p className="mb-1.5 text-caption text-muted-foreground">Maior índice em {competenciaLabel}</p>
              <div className="space-y-0.5">
                {maisCriticos.map((item, indice) => (
                  <RankBar
                    key={item.municipio.id}
                    posicao={indice + 1}
                    nome={item.municipio.nome}
                    valor={item.indice}
                    valorFormatado={formatIndice(item.indice)}
                    maximo={maisCriticos[0]?.indice ?? 1}
                    href={hrefMunicipio(item.municipio.id)}
                    acessorio={<RiskBadge classificacao={item.classificacao} />}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= LEITURA REGIONAL ================= */}
      <section className="space-y-3">
        <SectionHeader
          title="Distribuição por Região de Saúde"
          description="Os 645 municípios agrupados nos 17 DRS, ordenados pela participação de municípios em Crítico ou Alto"
        />
        <RegionDistribuicao grupos={regioes} />
        <p className="text-caption leading-relaxed text-muted-foreground">
          Agrupamento dos índices <strong>municipais</strong> por DRS, feito nesta tela. Não confundir com o{' '}
          <strong>Radar Regional</strong>, que é um índice calculado no grão regional, com supressão decidida de forma
          independente sobre o dado bruto — são números diferentes, com métodos diferentes.
        </p>
      </section>

      {/* ================= INVESTIGACAO ================= */}
      <section className="space-y-3 border-t border-border pt-6">
        <SectionHeader title="Aprofundar" />
        <div className="grid gap-3 sm:grid-cols-3">
          <LinkCard
            href="/radar-municipal"
            titulo="Radar Municipal"
            descricao="Mapa por indicador: internações, mortalidade, vulnerabilidade, risco"
          />
          <LinkCard href="/radar" titulo="Ranking completo" descricao="Todos os municípios ordenados pelo índice do Radar" />
          <LinkCard href="/metodologia" titulo="Metodologia" descricao="Como cada número é produzido, e o que ainda não é" />
        </div>
      </section>
    </div>
  );
}

function LinkCard({ href, titulo, descricao }: { href: string; titulo: string; descricao: string }) {
  return (
    <Link href={href}>
      <Card className="flex h-full items-start justify-between gap-3 p-4 transition-colors hover:border-primary/40 hover:bg-surface-muted">
        <span>
          <span className="block text-sm font-medium text-foreground">{titulo}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{descricao}</span>
        </span>
        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </Card>
    </Link>
  );
}

export default function VisaoGeralPage() {
  return (
    <Suspense fallback={<LoadingState label="Carregando..." />}>
      <DashboardContent />
    </Suspense>
  );
}
