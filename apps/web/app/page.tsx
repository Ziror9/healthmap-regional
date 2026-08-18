'use client';

import type { MunicipioResumoDTO, RiskFiltroResolvidoDTO, RiskScoreItemDTO } from '@healthmap/contracts';
import { AlertTriangle, Building2, Gauge, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { MapaSP, type MunicipioNoMapa } from '@/components/charts/map';
import { FilterBar } from '@/components/domain/filter-bar';
import { FreshnessIndicator } from '@/components/domain/freshness-indicator';
import { KpiCard } from '@/components/domain/kpi-card';
import { ProvenanceBadge } from '@/components/domain/provenance-badge';
import { RegionHeatGrid, type RegiaoGrupo } from '@/components/domain/region-heat-grid';
import { RiskBadge } from '@/components/domain/risk-badge';
import { RiskScaleLegend } from '@/components/domain/risk-scale-legend';
import { PageContent } from '@/components/layout/page-content';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';
import { ErrorState } from '@/components/states/error-state';
import { LoadingState } from '@/components/states/loading-state';
import { ApiRequestError, getRisk, getTodosMunicipios } from '@/lib/api';
import { formatCompetenciaLabel, formatIndice, formatNumero } from '@/lib/format';
import { inferOrigemMunicipio } from '@/lib/risk-display';
import { buildMunicipioHref, useRiskFiltersUrl } from '@/lib/use-risk-filters';

/**
 * Visao Geral - "o que esta acontecendo no territorio?". Consome GET
 * /api/risk (ja resolvido pela API) e GET /api/municipios; os KPIs sao
 * agregacao de APRESENTACAO sobre a lista ja calculada (contagem, media,
 * distribuicao) - nenhum indice, peso ou classificacao e recalculado aqui
 * (isso continua exclusivo de packages/risk).
 */

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'pronto'; risco: RiskScoreItemDTO[]; meta: RiskFiltroResolvidoDTO; municipios: MunicipioResumoDTO[] };

function DashboardContent() {
  const { filtros } = useRiskFiltersUrl();
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });

  useEffect(() => {
    let cancelado = false;
    setEstado({ tipo: 'carregando' });

    Promise.all([getRisk({ ...filtros, pageSize: 200 }), getTodosMunicipios()])
      .then(([risco, municipios]) => {
        if (cancelado) return;
        setEstado({ tipo: 'pronto', risco: risco.data, meta: risco.meta.filtros, municipios });
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
        description="Panorama do território monitorado pelo Radar de Risco."
        actions={<FilterBar />}
      />
      <PageContent>
        {estado.tipo === 'carregando' && <LoadingState label="Carregando panorama..." />}
        {estado.tipo === 'erro' && <ErrorState description={estado.mensagem} />}
        {estado.tipo === 'pronto' && (
          <DashboardPronto risco={estado.risco} meta={estado.meta} municipios={estado.municipios} />
        )}
      </PageContent>
    </>
  );
}

function DashboardPronto({
  risco,
  meta,
  municipios,
}: {
  risco: RiskScoreItemDTO[];
  meta: RiskFiltroResolvidoDTO;
  municipios: MunicipioResumoDTO[];
}) {
  const kpis = useMemo(() => {
    const total = risco.length;
    const somaIndice = risco.reduce((acumulado, item) => acumulado + item.indice, 0);
    const indiceMedio = total > 0 ? somaIndice / total : null;
    const criticosOuAltos = risco.filter((item) => item.classificacao === 'CRITICO' || item.classificacao === 'ALTO').length;
    const baixaConfiabilidade = risco.filter((item) => item.confiabilidade === 'BAIXA').length;
    return { total, indiceMedio, criticosOuAltos, baixaConfiabilidade };
  }, [risco]);

  const regioes = useMemo<RegiaoGrupo[]>(() => {
    const riscoPorMunicipio = new Map(risco.map((item) => [item.municipio.id, item]));
    const grupos = new Map<number, RegiaoGrupo>();
    for (const municipio of municipios) {
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

  const municipiosParaMapa = useMemo<MunicipioNoMapa[]>(() => {
    const riscoPorMunicipioId = new Map(risco.map((item) => [item.municipio.id, item]));
    return municipios.map((m) => {
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
        description="A competência selecionada pode ser apenas geográfica/de capacidade (sem Radar calculado). Selecione uma competência de jan/2025 a jun/2025 no filtro acima para ver o Radar calculado sobre a base DEMO — nenhuma competência tem Radar REAL calculado nesta fase: o SIH/SUS já foi ingerido (competência 2024-02), mas não compartilha competência com o snapshot de leitos do CNES, pré-requisito da Pressão Hospitalar Estimada (ver Metodologia)."
      />
    );
  }

  const competenciaLabel = formatCompetenciaLabel(primeiroItem.competencia.ano, primeiroItem.competencia.mes);
  const realCount = municipios.filter((m) => inferOrigemMunicipio(m.codigoIbge7) === 'REAL').length;
  const demoCount = municipios.length - realCount;
  // Propaga a competencia/origem que a Visao Geral esta mostrando para o
  // detalhe do municipio - sem isso o usuario perde o filtro temporal ao
  // navegar (ver CLAUDE.md, regra critica da Fase 5.1: nunca trocar
  // competencia silenciosamente).
  const hrefMunicipio = (municipioId: number) =>
    buildMunicipioHref(municipioId, {
      competenciaId: primeiroItem.competencia.id,
      riskConfigId: primeiroItem.riskConfigId,
      origem: meta.origem ?? undefined,
    });

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{municipios.length} municípios monitorados em São Paulo</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {realCount} com geografia oficial REAL (IBGE) · {demoCount} ilustrativos DEMO
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="inline-flex items-center text-xs text-muted-foreground">
            Radar calculado sobre <ProvenanceBadge origem={meta.origem ?? primeiroItem.origem} className="mx-1.5 align-middle" />
          </span>
          <FreshnessIndicator competenciaLabel={competenciaLabel} calculadoEm={primeiroItem?.calculadoEm} />
        </div>
      </div>

      <section>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Municípios com Radar calculado"
            value={formatNumero(kpis.total)}
            icon={Building2}
            hint={`de ${municipios.length} monitorados`}
          />
          <KpiCard
            label="Índice médio de risco"
            value={kpis.indiceMedio !== null ? formatIndice(kpis.indiceMedio) : '—'}
            icon={Gauge}
            hint="Escala 0–1 · média dos municípios exibidos"
          />
          <KpiCard
            label="Crítico ou Alto"
            value={formatNumero(kpis.criticosOuAltos)}
            icon={AlertTriangle}
            hint="municípios que merecem atenção prioritária"
          />
          <KpiCard
            label="Baixa confiabilidade"
            value={formatNumero(kpis.baixaConfiabilidade)}
            icon={ShieldAlert}
            hint="volume de dados abaixo do limiar mínimo"
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          KPIs calculados no navegador a partir da lista já materializada pela API (contagem/média de
          apresentação — nenhum índice é recalculado no frontend).
        </p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Mapa territorial · geografia REAL</h2>
              <p className="text-xs text-muted-foreground">645 municípios de SP, malha oficial do IBGE</p>
            </div>
            <RiskScaleLegend />
          </div>

          <MapaSP municipios={municipiosParaMapa} buildHref={hrefMunicipio} />
          <p className="text-xs leading-relaxed text-muted-foreground">
            O Radar de Risco ainda é calculado apenas sobre a base DEMO (municípios ilustrativos, sem
            geometria própria — por isso não aparecem coloridos aqui). Nenhum índice REAL está disponível
            nesta fase, mesmo com SIH e CNES já parcialmente ingeridos (ver Metodologia). Clique em um
            município para abrir o detalhe.
          </p>

          <div className="flex items-center justify-between border-t border-border pt-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Radar por Região de Saúde · base DEMO</h3>
              <p className="text-xs text-muted-foreground">
                Onde o Radar calculado hoje realmente existe — os municípios DEMO não têm geometria própria
                para aparecer no mapa acima
              </p>
            </div>
          </div>
          <RegionHeatGrid grupos={regioes} />
        </div>

        <div className="min-w-0 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Municípios em maior atenção</h2>
          <div className="space-y-2">
            {maisCriticos.map((item) => (
              <Link
                key={item.municipio.id}
                href={hrefMunicipio(item.municipio.id)}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 transition-colors hover:border-primary/40 hover:bg-surface-muted"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{item.municipio.nome}</p>
                  <p className="font-mono text-xs text-muted-foreground">índice {formatIndice(item.indice)}</p>
                </div>
                <RiskBadge classificacao={item.classificacao} className="shrink-0" />
              </Link>
            ))}
          </div>
          <Link href="/radar" className="inline-flex items-center text-sm font-medium text-primary hover:underline">
            Ver ranking completo →
          </Link>
        </div>
      </section>
    </div>
  );
}

export default function VisaoGeralPage() {
  return (
    <Suspense fallback={<LoadingState label="Carregando..." />}>
      <DashboardContent />
    </Suspense>
  );
}
