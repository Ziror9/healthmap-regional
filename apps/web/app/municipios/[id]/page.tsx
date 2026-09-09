'use client';

import type { FluxoMunicipioDTO, IndicadorDefinicaoDTO, MunicipioDetalheDTO, RiscoDoMunicipioDTO, RiskComponenteItemDTO } from '@healthmap/contracts';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { LineChart, type PontoSerie } from '@/components/charts/line-chart';
import { ConfidenceBadge } from '@/components/domain/confidence-badge';
import { FilterBar } from '@/components/domain/filter-bar';
import { NatureBadge } from '@/components/domain/nature-badge';
import { ProvenanceBadge } from '@/components/domain/provenance-badge';
import { RiskScorePanel } from '@/components/domain/risk-score-panel';
import { UnavailableNote } from '@/components/domain/unavailable-note';
import { PageContent } from '@/components/layout/page-content';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';
import { ErrorState } from '@/components/states/error-state';
import { LoadingState } from '@/components/states/loading-state';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { FluxoPanel } from '@/components/domain/fluxo-panel';
import { useDetalheBreadcrumb } from '@/components/layout/app-shell';
import { ApiRequestError, getFluxoMunicipio, getIndicadores, getMunicipio, getRiskComponentes } from '@/lib/api';
import { formatCompetenciaLabel, formatNumero } from '@/lib/format';
import { getComponenteLabel, getMotivoIndisponibilidade, inferOrigemMunicipio } from '@/lib/risk-display';
import { useRiskFiltersUrl } from '@/lib/use-risk-filters';

type EstadoPagina =
  | { tipo: 'carregando' }
  | { tipo: 'naoEncontrado' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'pronto'; municipio: MunicipioDetalheDTO; indicadoresCatalogo: IndicadorDefinicaoDTO[] };

type EstadoComponentes =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'pronto'; itens: RiskComponenteItemDTO[] };

/** Fase 5.8 - fluxo assistencial do municipio (busca propria, independente do resto da pagina). */
type EstadoFluxo =
  | { tipo: 'carregando' }
  | { tipo: 'indisponivel' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'pronto'; fluxo: FluxoMunicipioDTO };

export default function MunicipioDetalhePage() {
  const params = useParams<{ id: string }>();
  const municipioId = Number(params.id);
  const { filtros, setFiltro } = useRiskFiltersUrl();

  const [estado, setEstado] = useState<EstadoPagina>({ tipo: 'carregando' });
  const [componentes, setComponentes] = useState<EstadoComponentes>({ tipo: 'carregando' });
  const [fluxo, setFluxo] = useState<EstadoFluxo>({ tipo: 'carregando' });

  useEffect(() => {
    if (!Number.isFinite(municipioId) || municipioId <= 0) {
      setEstado({ tipo: 'erro', mensagem: 'Identificador de município inválido.' });
      return;
    }

    let cancelado = false;
    setEstado({ tipo: 'carregando' });

    // Busca sempre o historico completo (sem filtro de competencia) - a
    // pagina precisa dele para a serie temporal E para poder dizer "existe
    // dado em outras competencias" quando a selecionada nao tiver nada. O
    // filtro de competencia/origem selecionado (URL) e aplicado abaixo,
    // client-side, sobre esse historico ja calculado pela API - nao e
    // recalculo de indice/score, so escolha de qual linha ja pronta exibir.
    Promise.all([getMunicipio(municipioId), getIndicadores({ pageSize: 200 })])
      .then(([municipioResp, indicadoresResp]) => {
        if (cancelado) return;
        setEstado({ tipo: 'pronto', municipio: municipioResp.data, indicadoresCatalogo: indicadoresResp.data });
      })
      .catch((erro: unknown) => {
        if (cancelado) return;
        if (erro instanceof ApiRequestError && erro.status === 404) {
          setEstado({ tipo: 'naoEncontrado' });
          return;
        }
        const mensagem = erro instanceof ApiRequestError ? erro.message : 'Falha desconhecida ao consultar a API.';
        setEstado({ tipo: 'erro', mensagem });
      });

    return () => {
      cancelado = true;
    };
  }, [municipioId]);

  const competenciaSelecionadaExplicitamente = filtros.competenciaId !== undefined;

  /** Riscos deste municipio que batem com a competencia/origem selecionadas na URL - nunca uma competencia diferente da pedida. */
  const riscosNaSelecao = useMemo<RiscoDoMunicipioDTO[]>(() => {
    if (estado.tipo !== 'pronto') return [];
    if (!competenciaSelecionadaExplicitamente) return estado.municipio.riscos;
    return estado.municipio.riscos.filter(
      (r) => r.competencia.id === filtros.competenciaId && (filtros.origem === undefined || r.origem === filtros.origem),
    );
  }, [estado, competenciaSelecionadaExplicitamente, filtros.competenciaId, filtros.origem]);

  const riscoSelecionado: RiscoDoMunicipioDTO | undefined =
    filtros.riskConfigId !== undefined
      ? riscosNaSelecao.find((r) => r.riskConfigId === filtros.riskConfigId)
      : riscosNaSelecao[0];

  const semDadoParaCompetenciaSelecionada =
    estado.tipo === 'pronto' && competenciaSelecionadaExplicitamente && riscosNaSelecao.length === 0;

  useEffect(() => {
    if (!riscoSelecionado) return;
    let cancelado = false;
    setComponentes({ tipo: 'carregando' });

    getRiskComponentes(municipioId, { competenciaId: riscoSelecionado.competencia.id, riskConfigId: riscoSelecionado.riskConfigId })
      .then((resposta) => {
        if (!cancelado) setComponentes({ tipo: 'pronto', itens: resposta.data });
      })
      .catch((erro: unknown) => {
        if (cancelado) return;
        const mensagem = erro instanceof ApiRequestError ? erro.message : 'Falha ao carregar os componentes do Radar.';
        setComponentes({ tipo: 'erro', mensagem });
      });

    return () => {
      cancelado = true;
    };
  }, [municipioId, riscoSelecionado?.competencia.id, riscoSelecionado?.riskConfigId]);

  // Fase 5.8: o fluxo tem grao ANUAL e nao depende da competencia/riskConfig
  // selecionadas - por isso e uma busca separada, com o ano default resolvido
  // pela API (nunca escolhido aqui).
  useEffect(() => {
    if (!Number.isFinite(municipioId) || municipioId <= 0) return;
    let cancelado = false;
    setFluxo({ tipo: 'carregando' });

    getFluxoMunicipio(municipioId)
      .then((resposta) => {
        if (cancelado) return;
        setFluxo(resposta.data ? { tipo: 'pronto', fluxo: resposta.data } : { tipo: 'indisponivel' });
      })
      .catch((erro: unknown) => {
        if (cancelado) return;
        const mensagem = erro instanceof ApiRequestError ? erro.message : 'Falha ao carregar o fluxo assistencial.';
        setFluxo({ tipo: 'erro', mensagem });
      });

    return () => {
      cancelado = true;
    };
  }, [municipioId]);

  // O breadcrumb da Topbar recebe o nome do municipio: sem isso o ultimo nivel
  // da trilha seria o id da rota, que nao significa nada para quem le.
  useDetalheBreadcrumb(estado.tipo === 'pronto' ? estado.municipio.nome : null);

  const serieTemporal = useMemo<PontoSerie[]>(() => {
    if (estado.tipo !== 'pronto' || !riscoSelecionado) return [];
    return estado.municipio.riscos
      .filter((r) => r.riskConfigId === riscoSelecionado.riskConfigId)
      .slice()
      .sort((a, b) => a.competencia.ano * 12 + a.competencia.mes - (b.competencia.ano * 12 + b.competencia.mes))
      .map((r) => ({
        rotulo: formatCompetenciaLabel(r.competencia.ano, r.competencia.mes),
        valor: r.indice,
        competenciaId: r.competencia.id,
      }));
  }, [estado, riscoSelecionado]);

  const indiceDestacadoNaSerie = riscoSelecionado
    ? serieTemporal.findIndex((p) => p.competenciaId === riscoSelecionado.competencia.id)
    : -1;

  /**
   * RiskConfigs DISTINTAS entre os riscos da selecao atual. `riscosNaSelecao`
   * traz uma linha por competencia - sem deduplicar, o seletor listava a
   * mesma config uma vez por competencia (12 opcoes identicas com a carga
   * REAL de 2024, alem de chave React duplicada). O seletor escolhe uma
   * CONFIGURACAO, nao uma competencia.
   */
  const configuracoesDisponiveis = useMemo(() => {
    const vistas = new Map<number, { riskConfigId: number; origem: RiscoDoMunicipioDTO['origem'] }>();
    for (const r of riscosNaSelecao) {
      if (!vistas.has(r.riskConfigId)) vistas.set(r.riskConfigId, { riskConfigId: r.riskConfigId, origem: r.origem });
    }
    return [...vistas.values()].sort((a, b) => b.riskConfigId - a.riskConfigId);
  }, [riscosNaSelecao]);

  /** Outras competencias com Radar calculado para este municipio, para o aviso "existe dado em outro periodo" - nunca exibidas automaticamente no lugar da selecionada. */
  const competenciasDisponiveis = useMemo(() => {
    if (estado.tipo !== 'pronto') return [];
    const vistas = new Map<number, { id: number; label: string; origem: RiscoDoMunicipioDTO['origem'] }>();
    for (const r of estado.municipio.riscos) {
      if (!vistas.has(r.competencia.id)) {
        vistas.set(r.competencia.id, {
          id: r.competencia.id,
          label: formatCompetenciaLabel(r.competencia.ano, r.competencia.mes),
          origem: r.origem,
        });
      }
    }
    return [...vistas.values()].sort((a, b) => b.id - a.id);
  }, [estado]);

  if (estado.tipo === 'carregando') {
    return (
      <PageContent>
        <LoadingState label="Carregando município..." />
      </PageContent>
    );
  }

  if (estado.tipo === 'naoEncontrado') {
    return (
      <PageContent>
        <EmptyState title="Município não encontrado." description="Verifique o link ou volte para a lista de municípios." />
        <Link href="/municipios" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Voltar para Municípios
        </Link>
      </PageContent>
    );
  }

  if (estado.tipo === 'erro') {
    return (
      <PageContent>
        <ErrorState description={estado.mensagem} />
      </PageContent>
    );
  }

  const { municipio, indicadoresCatalogo } = estado;
  const origemMunicipio = inferOrigemMunicipio(municipio.codigoIbge7);

  return (
    <>
      <PageHeader
        title={municipio.nome}
        titleBadge={<ProvenanceBadge origem={origemMunicipio} />}
        description={`${municipio.regiaoSaude.nome} · ${municipio.uf} · Código IBGE ${municipio.codigoIbge7}${
          origemMunicipio === 'DEMO' ? ' · Município ilustrativo — pode ter o mesmo nome de um município real' : ''
        }`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <FilterBar />
            <Link href="/radar" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Voltar ao ranking
            </Link>
          </div>
        }
      />
      <PageContent className="space-y-8">
        {semDadoParaCompetenciaSelecionada ? (
          <EmptyState
            title="Sem dados disponíveis para esta competência."
            description={
              competenciasDisponiveis.length > 0
                ? `Este município não tem Radar calculado no período selecionado. Existe dado em ${competenciasDisponiveis.length === 1 ? 'outra competência' : `${competenciasDisponiveis.length} outras competências`} — escolha abaixo para ver.`
                : 'Este município não tem nenhum Radar calculado ainda, em nenhuma competência.'
            }
          >
            {competenciasDisponiveis.length > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {competenciasDisponiveis.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setFiltro('competenciaId', c.id);
                      setFiltro('riskConfigId', undefined);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-surface-muted"
                  >
                    {c.label}
                    <ProvenanceBadge origem={c.origem} />
                  </button>
                ))}
              </div>
            )}
          </EmptyState>
        ) : !riscoSelecionado ? (
          <EmptyState
            title="Nenhum RiskScore calculado para este município."
            description="O Radar ainda não produziu um índice para nenhuma competência/configuração disponível."
          />
        ) : (
          <>
            <section className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
              <div className="space-y-3">
                {configuracoesDisponiveis.length > 1 && (
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    Configuração
                    <Select
                      value={riscoSelecionado.riskConfigId}
                      onChange={(evento) => setFiltro('riskConfigId', Number(evento.target.value))}
                    >
                      {configuracoesDisponiveis.map((c) => (
                        <option key={c.riskConfigId} value={c.riskConfigId}>
                          config #{c.riskConfigId} · {c.origem}
                        </option>
                      ))}
                    </Select>
                  </label>
                )}
                <RiskScorePanel risco={riscoSelecionado} />
              </div>

              <Card className="p-5">
                <h2 className="text-sm font-semibold text-foreground">Histórico do índice</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Configuração #{riscoSelecionado.riskConfigId} · {serieTemporal.length}{' '}
                  {serieTemporal.length === 1 ? 'competência disponível' : 'competências disponíveis'}
                  {competenciaSelecionadaExplicitamente && (
                    <> · competência selecionada em destaque: <strong className="text-foreground">{formatCompetenciaLabel(riscoSelecionado.competencia.ano, riscoSelecionado.competencia.mes)}</strong></>
                  )}
                </p>
                <div className="mt-4">
                  {serieTemporal.length > 0 ? (
                    <LineChart pontos={serieTemporal} indiceDestacado={indiceDestacadoNaSerie >= 0 ? indiceDestacadoNaSerie : undefined} />
                  ) : (
                    <EmptyState title="Sem histórico suficiente para série temporal." />
                  )}
                </div>
              </Card>
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Componentes do Radar</h2>
              {componentes.tipo === 'carregando' && <LoadingState label="Carregando componentes..." />}
              {componentes.tipo === 'erro' && <ErrorState description={componentes.mensagem} />}
              {componentes.tipo === 'pronto' && (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {componentes.itens.map((item) => (
                    <ComponenteCard key={item.componente} item={item} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Fluxo assistencial</h2>
            <p className="text-xs text-muted-foreground">
              Onde os residentes deste município se internam — e quem este município atende
            </p>
          </div>
          {fluxo.tipo === 'carregando' && <LoadingState label="Carregando fluxo assistencial..." />}
          {fluxo.tipo === 'erro' && <ErrorState description={fluxo.mensagem} />}
          {fluxo.tipo === 'indisponivel' && (
            <EmptyState
              title="Fluxo assistencial não disponível."
              description="Nenhum ano de fluxo (SIH/SUS) carregado para este município."
              className="py-10"
            />
          )}
          {fluxo.tipo === 'pronto' && <FluxoPanel fluxo={fluxo.fluxo} />}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Indicadores</h2>
          {municipio.indicadores.length === 0 ? (
            <EmptyState title="Nenhum indicador municipal calculado." className="py-10" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {municipio.indicadores.map((indicador) => {
                const definicao = indicadoresCatalogo.find((d) => d.chave === indicador.indicadorDefinicaoId);
                return (
                  <Card key={`${indicador.indicadorDefinicaoId}-${indicador.ano}`} className="p-4">
                    <p className="text-sm font-medium text-foreground">{definicao?.nome ?? indicador.indicadorDefinicaoId}</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">
                      {formatNumero(indicador.valor, 2)}
                      {definicao && <span className="ml-1 text-sm font-normal text-muted-foreground">{definicao.unidade}</span>}
                    </p>
                    {indicador.denominador !== null && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Denominador (população/base do cálculo): {formatNumero(indicador.denominador, 0)}
                      </p>
                    )}
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Ano {indicador.ano}</span>
                      <ProvenanceBadge origem={indicador.origem} />
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </PageContent>
    </>
  );
}

function ComponenteCard({ item }: { item: RiskComponenteItemDTO }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{getComponenteLabel(item.componente)}</p>
        <NatureBadge natureza={item.natureza} />
      </div>

      {item.disponivel ? (
        <div className="mt-3 space-y-2">
          <p className="text-2xl font-semibold text-foreground">{item.valorBruto !== null ? formatNumero(item.valorBruto, 4) : '—'}</p>
          <p className="text-xs text-muted-foreground">
            normalizado (percentil na coorte): {item.valorNormalizado !== null ? item.valorNormalizado.toFixed(2) : '—'}
          </p>
          <ConfidenceBadge confiabilidade={item.confiabilidade} />
        </div>
      ) : (
        <div className="mt-3">
          <UnavailableNote motivo={getMotivoIndisponibilidade(item.componente)} />
        </div>
      )}
    </Card>
  );
}
