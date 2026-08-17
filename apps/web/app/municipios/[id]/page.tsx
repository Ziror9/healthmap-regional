'use client';

import type { IndicadorDefinicaoDTO, MunicipioDetalheDTO, RiskComponenteItemDTO } from '@healthmap/contracts';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { LineChart, type PontoSerie } from '@/components/charts/line-chart';
import { ConfidenceBadge } from '@/components/domain/confidence-badge';
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
import { ApiRequestError, getIndicadores, getMunicipio, getRiskComponentes } from '@/lib/api';
import { formatCompetenciaLabel, formatNumero } from '@/lib/format';
import { getComponenteLabel, getMotivoIndisponibilidade, inferOrigemMunicipio } from '@/lib/risk-display';

type EstadoPagina =
  | { tipo: 'carregando' }
  | { tipo: 'naoEncontrado' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'pronto'; municipio: MunicipioDetalheDTO; indicadoresCatalogo: IndicadorDefinicaoDTO[] };

type EstadoComponentes =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'pronto'; itens: RiskComponenteItemDTO[] };

export default function MunicipioDetalhePage() {
  const params = useParams<{ id: string }>();
  const municipioId = Number(params.id);

  const [estado, setEstado] = useState<EstadoPagina>({ tipo: 'carregando' });
  const [riscoIndiceSelecionado, setRiscoIndiceSelecionado] = useState(0);
  const [componentes, setComponentes] = useState<EstadoComponentes>({ tipo: 'carregando' });

  useEffect(() => {
    if (!Number.isFinite(municipioId) || municipioId <= 0) {
      setEstado({ tipo: 'erro', mensagem: 'Identificador de município inválido.' });
      return;
    }

    let cancelado = false;
    setEstado({ tipo: 'carregando' });
    setRiscoIndiceSelecionado(0);

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

  const riscoSelecionado = estado.tipo === 'pronto' ? estado.municipio.riscos[riscoIndiceSelecionado] : undefined;

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

  const serieTemporal = useMemo<PontoSerie[]>(() => {
    if (estado.tipo !== 'pronto' || !riscoSelecionado) return [];
    return estado.municipio.riscos
      .filter((r) => r.riskConfigId === riscoSelecionado.riskConfigId)
      .slice()
      .sort((a, b) => a.competencia.ano * 12 + a.competencia.mes - (b.competencia.ano * 12 + b.competencia.mes))
      .map((r) => ({ rotulo: formatCompetenciaLabel(r.competencia.ano, r.competencia.mes), valor: r.indice }));
  }, [estado, riscoSelecionado]);

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
        description={`${municipio.regiaoSaude.nome} · ${municipio.uf} · Código IBGE ${municipio.codigoIbge7}${
          origemMunicipio === 'DEMO' ? ' · Município ilustrativo (DEMO) — pode ter o mesmo nome de um município real' : ''
        }`}
        actions={
          <Link href="/radar" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Voltar ao ranking
          </Link>
        }
      />
      <PageContent className="space-y-8">
        {!riscoSelecionado ? (
          <EmptyState
            title="Nenhum RiskScore calculado para este município."
            description="O Radar ainda não produziu um índice para nenhuma competência/configuração disponível."
          />
        ) : (
          <>
            <section className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
              <div className="space-y-3">
                {municipio.riscos.length > 1 && (
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    Competência / configuração
                    <Select
                      value={riscoIndiceSelecionado}
                      onChange={(evento) => setRiscoIndiceSelecionado(Number(evento.target.value))}
                    >
                      {municipio.riscos.map((r, indice) => (
                        <option key={`${r.competencia.id}-${r.riskConfigId}`} value={indice}>
                          {formatCompetenciaLabel(r.competencia.ano, r.competencia.mes)} · config #{r.riskConfigId} · {r.origem}
                        </option>
                      ))}
                    </Select>
                  </label>
                )}
                <RiskScorePanel risco={riscoSelecionado} />
              </div>

              <Card className="p-5">
                <h2 className="text-sm font-semibold text-foreground">Série temporal do índice</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Configuração #{riscoSelecionado.riskConfigId} · {serieTemporal.length}{' '}
                  {serieTemporal.length === 1 ? 'competência disponível' : 'competências disponíveis'}
                </p>
                <div className="mt-4">
                  {serieTemporal.length > 0 ? (
                    <LineChart pontos={serieTemporal} />
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
