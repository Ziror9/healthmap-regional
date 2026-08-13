'use client';

import type { MunicipioResumoDTO, RiskFiltroResolvidoDTO, RiskScoreItemDTO } from '@healthmap/contracts';
import { AlertTriangle, Building2, Gauge, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
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
import { ApiRequestError, getMunicipios, getRisk } from '@/lib/api';
import { formatCompetenciaLabel, formatIndice, formatNumero } from '@/lib/format';
import { useRiskFiltersUrl } from '@/lib/use-risk-filters';
import { Card } from '@/components/ui/card';

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

    Promise.all([getRisk({ ...filtros, pageSize: 200 }), getMunicipios({ pageSize: 200 })])
      .then(([risco, municipios]) => {
        if (cancelado) return;
        setEstado({ tipo: 'pronto', risco: risco.data, meta: risco.meta.filtros, municipios: municipios.data });
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

  const primeiroItem = risco[0];

  if (!primeiroItem) {
    return (
      <EmptyState
        title="Nenhum resultado do Radar para os filtros selecionados."
        description="Isso pode significar que a configuração do Radar escolhida ainda não tem componentes calculados, ou que a origem filtrada não tem dado nesta competência."
      />
    );
  }

  const competenciaLabel = formatCompetenciaLabel(primeiroItem.competencia.ano, primeiroItem.competencia.mes);

  return (
    <div className="space-y-8">
      <FreshnessIndicator competenciaLabel={competenciaLabel} calculadoEm={primeiroItem?.calculadoEm} />

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
          Origem dos dados: <ProvenanceBadge origem={meta.origem ?? primeiroItem.origem} className="mx-1 align-middle" />
          KPIs calculados no navegador a partir da lista já materializada pela API (contagem/média de
          apresentação — nenhum índice é recalculado no frontend).
        </p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Território por Região de Saúde</h2>
            <RiskScaleLegend />
          </div>

          <Card className="border-dashed p-4 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Mapa geográfico indisponível nesta fase.</p>
            <p className="mt-1 leading-relaxed">
              Ainda não há GeoJSON oficial dos municípios de São Paulo nem coordenadas (latitude/longitude)
              populadas na base — bloqueio documentado em <code className="font-mono">docs/known-limitations.md</code>.
              A visão abaixo agrupa os municípios por Região de Saúde (dado real, já modelado) como alternativa,
              até que a fonte geográfica oficial esteja disponível.
            </p>
          </Card>

          <RegionHeatGrid grupos={regioes} />
        </div>

        <div className="min-w-0 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Municípios em maior atenção</h2>
          <div className="space-y-2">
            {maisCriticos.map((item) => (
              <Link
                key={item.municipio.id}
                href={`/municipios/${item.municipio.id}`}
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
