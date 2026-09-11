'use client';

import type {
  MunicipioResumoDTO,
  RiskComponenteItemDTO,
  RiskFiltroResolvidoDTO,
  RiskScoreRegionalItemDTO,
} from '@healthmap/contracts';
import { ArrowLeft, ArrowRight, Info } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { MapaSP, type MunicipioNoMapa } from '@/components/charts/map';
import { ConfidenceBadge } from '@/components/domain/confidence-badge';
import { FilterBar } from '@/components/domain/filter-bar';
import { FiltrosResponsivos } from '@/components/domain/filtros-responsivos';
import { FreshnessIndicator } from '@/components/domain/freshness-indicator';
import { NatureBadge } from '@/components/domain/nature-badge';
import { ProvenanceBadge } from '@/components/domain/provenance-badge';
import { MiniBarra } from '@/components/domain/rank-bar';
import { RiskBadge } from '@/components/domain/risk-badge';
import { RiskScaleLegend } from '@/components/domain/risk-scale-legend';
import { UnavailableNote } from '@/components/domain/unavailable-note';
import { PageContent } from '@/components/layout/page-content';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';
import { ErrorState } from '@/components/states/error-state';
import { LoadingState } from '@/components/states/loading-state';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiRequestError, getRiskComponentesRegiao, getRiskRegional, getTodosMunicipios } from '@/lib/api';
import { formatCompetenciaLabel, formatIndice, formatNumero } from '@/lib/format';
import {
  agruparMunicipiosPorRegiao,
  contarPorClassificacao,
  indexarPorRegiao,
  interpretarRegiaoId,
  motivoIndisponibilidadeRegional,
  ordenarPorIndice,
} from '@/lib/regioes';
import { CLASSIFICACAO_ORDEM, getClassificacaoDisplay, getComponenteLabel, inferOrigemMunicipio } from '@/lib/risk-display';
import { buildMunicipioHref, useRiskFiltersUrl } from '@/lib/use-risk-filters';
import { cn } from '@/lib/utils';

/**
 * Regioes de Saude (redesign E6) - a interface do RADAR REGIONAL.
 *
 * Consome so endpoints que ja existiam desde a Fase 5.5:
 *  - `GET /api/risk/regioes` (um `RiskScoreRegional` por DRS);
 *  - `GET /api/risk/regioes/:id/components` (componentes da DRS selecionada);
 *  - `GET /api/municipios` (a DRS de cada municipio, para o mapa).
 *
 * O indice regional NAO e o agrupamento dos indices municipais (esse e o card
 * "Radar por Regiao de Saude" da Visao Geral): e calculado no grao da DRS,
 * sobre o dado bruto regional, com supressao decidida na propria regiao. A
 * pagina diz isso antes de qualquer numero. O mapa pinta cada municipio com a
 * classificacao DA SUA DRS - o tooltip nomeia a DRS para que ninguem leia
 * como o risco do municipio.
 */

type EstadoScores =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'pronto'; scores: RiskScoreRegionalItemDTO[]; meta: RiskFiltroResolvidoDTO };

type EstadoComponentes =
  | { tipo: 'nenhum' }
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'pronto'; itens: RiskComponenteItemDTO[] };

const CLASSE_SEM_INDICE = 'fill-unavailable-bg';

function RegioesContent() {
  const { filtros } = useRiskFiltersUrl();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const regiaoId = interpretarRegiaoId(searchParams.get('regiao'));

  const [estado, setEstado] = useState<EstadoScores>({ tipo: 'carregando' });
  const [municipios, setMunicipios] = useState<MunicipioResumoDTO[]>([]);
  const [componentes, setComponentes] = useState<EstadoComponentes>({ tipo: 'nenhum' });

  const selecionarRegiao = useCallback(
    (id: number | undefined) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id === undefined) params.delete('regiao');
      else params.set('regiao', String(id));
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  useEffect(() => {
    let cancelado = false;
    getTodosMunicipios()
      .then((lista) => {
        if (!cancelado) setMunicipios(lista.filter((m) => inferOrigemMunicipio(m.codigoIbge7) === 'REAL'));
      })
      .catch(() => {
        /* sem a lista o ranking continua; so o mapa e a lista de municipios da DRS ficam vazios */
      });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    let cancelado = false;
    setEstado({ tipo: 'carregando' });
    // Real-first (Fase 5.9), como o Radar de Risco: sem origem explicita a
    // leitura e sobre as 17 DRS REAL, nunca sobre as regioes ilustrativas.
    getRiskRegional({
      competenciaId: filtros.competenciaId,
      riskConfigId: filtros.riskConfigId,
      origem: filtros.origem ?? 'REAL',
      pageSize: 200,
    })
      .then((resposta) => {
        if (!cancelado) setEstado({ tipo: 'pronto', scores: resposta.data, meta: resposta.meta.filtros });
      })
      .catch((erro: unknown) => {
        if (!cancelado) {
          setEstado({
            tipo: 'erro',
            mensagem: erro instanceof ApiRequestError ? erro.message : 'Falha ao consultar o Radar Regional.',
          });
        }
      });
    return () => {
      cancelado = true;
    };
  }, [filtros.competenciaId, filtros.riskConfigId, filtros.origem]);

  const scores = useMemo(() => (estado.tipo === 'pronto' ? ordenarPorIndice(estado.scores) : []), [estado]);
  const porRegiao = useMemo(() => indexarPorRegiao(scores), [scores]);
  const municipiosPorRegiao = useMemo(() => agruparMunicipiosPorRegiao(municipios), [municipios]);
  const regiaoDoCodigo = useMemo(() => {
    const mapa = new Map<string, { id: number; nome: string }>();
    for (const m of municipios) mapa.set(m.codigoIbge7, m.regiaoSaude);
    return mapa;
  }, [municipios]);
  const selecionada = regiaoId !== undefined ? porRegiao.get(regiaoId) : undefined;

  useEffect(() => {
    if (!selecionada) {
      setComponentes({ tipo: 'nenhum' });
      return;
    }
    let cancelado = false;
    setComponentes({ tipo: 'carregando' });
    // Mesma competencia/config/origem do score exibido - componentes de outro
    // recorte nao explicariam o indice que esta na tela.
    getRiskComponentesRegiao(selecionada.regiaoSaude.id, {
      competenciaId: selecionada.competencia.id,
      riskConfigId: selecionada.riskConfigId,
      origem: selecionada.origem,
    })
      .then((resposta) => {
        if (!cancelado) setComponentes({ tipo: 'pronto', itens: resposta.data });
      })
      .catch((erro: unknown) => {
        if (!cancelado) {
          setComponentes({
            tipo: 'erro',
            mensagem: erro instanceof ApiRequestError ? erro.message : 'Falha ao carregar os componentes.',
          });
        }
      });
    return () => {
      cancelado = true;
    };
  }, [selecionada]);

  const municipiosNoMapa = useMemo<MunicipioNoMapa[]>(
    () =>
      municipios.map((m) => {
        const score = porRegiao.get(m.regiaoSaude.id);
        return {
          id: m.id,
          codigoIbge7: m.codigoIbge7,
          nome: m.nome,
          classificacao: score?.classificacao ?? null,
          indice: score?.indice ?? null,
        };
      }),
    [municipios, porRegiao],
  );

  const corPorCodigo = useCallback(
    (codigo: string) => {
      const regiao = regiaoDoCodigo.get(codigo);
      const score = regiao ? porRegiao.get(regiao.id) : undefined;
      const base = score ? getClassificacaoDisplay(score.classificacao).mapFillClass : CLASSE_SEM_INDICE;
      // Com uma DRS selecionada, as demais recuam - a cor continua sendo a
      // delas (dado), so perde destaque.
      return regiaoId !== undefined && regiao?.id !== regiaoId ? `${base} opacity-25` : base;
    },
    [regiaoDoCodigo, porRegiao, regiaoId],
  );

  const tooltipPorCodigo = useCallback(
    (codigo: string, m: MunicipioNoMapa) => {
      const regiao = regiaoDoCodigo.get(codigo);
      if (!regiao) return m.nome;
      const score = porRegiao.get(regiao.id);
      if (!score) return `${m.nome}\nDRS ${regiao.nome} · sem índice regional nesta competência`;
      const display = getClassificacaoDisplay(score.classificacao);
      return `${m.nome}\nDRS ${regiao.nome} (${score.regiaoSaude.codigo}) · ${display.label} · índice regional ${formatIndice(score.indice)}`;
    },
    [regiaoDoCodigo, porRegiao],
  );

  const quantidadeFiltros = (filtros.competenciaId !== undefined ? 1 : 0) + (filtros.origem !== undefined ? 1 : 0);
  const primeiro = scores[0];

  return (
    <>
      <PageHeader
        title="Regiões de Saúde"
        description="Radar Regional: um índice por Departamento Regional de Saúde (DRS), calculado no grão da região."
        actions={
          <FiltrosResponsivos quantidadeAtiva={quantidadeFiltros}>
            <FilterBar />
          </FiltrosResponsivos>
        }
      />
      <PageContent className="space-y-4">
        <AvisoDistincao />

        {estado.tipo === 'carregando' && <LoadingState label="Carregando Radar Regional..." variant="map" />}
        {estado.tipo === 'erro' && <ErrorState description={estado.mensagem} />}
        {estado.tipo === 'pronto' && scores.length === 0 && (
          <EmptyState
            title="Nenhum índice regional para esta competência e origem."
            description="O Radar Regional REAL cobre as 12 competências de 2024. Ajuste a competência ou a origem."
          />
        )}

        {estado.tipo === 'pronto' && primeiro && (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="inline-flex items-center text-caption text-muted-foreground">
                Índice regional calculado sobre
                <ProvenanceBadge origem={estado.meta.origem ?? primeiro.origem} className="mx-1.5 align-middle" />
                · {scores.length} DRS
              </span>
              <FreshnessIndicator
                competenciaLabel={formatCompetenciaLabel(primeiro.competencia.ano, primeiro.competencia.mes)}
                calculadoEm={primeiro.calculadoEm}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
              <div className="min-w-0 space-y-2">
                <MapaSP
                  municipios={municipiosNoMapa}
                  corPorCodigo={corPorCodigo}
                  tooltipPorCodigo={tooltipPorCodigo}
                  onClickMunicipio={(m) => {
                    const regiao = regiaoDoCodigo.get(m.codigoIbge7);
                    if (regiao) selecionarRegiao(regiao.id === regiaoId ? undefined : regiao.id);
                  }}
                  legenda={
                    <>
                      <p className="text-label text-muted-foreground">
                        Cada município tem a cor do índice da <strong className="font-semibold">sua DRS</strong>
                      </p>
                      <RiskScaleLegend />
                    </>
                  }
                />
                <p className="text-caption text-muted-foreground">
                  Clique num município para selecionar a DRS a que ele pertence; clique de novo para limpar.
                </p>
              </div>

              <div className="min-w-0">
                {selecionada ? (
                  <PainelRegiao
                    score={selecionada}
                    componentes={componentes}
                    municipios={municipiosPorRegiao.get(selecionada.regiaoSaude.id) ?? []}
                    onLimpar={() => selecionarRegiao(undefined)}
                  />
                ) : regiaoId !== undefined ? (
                  <Card className="space-y-3 p-4">
                    <BotaoTodas onClick={() => selecionarRegiao(undefined)} />
                    <EmptyState
                      title="Esta região não tem índice regional nesta competência e origem."
                      description="Pode ser uma região ilustrativa (DEMO) ou um identificador que não existe."
                      className="py-6"
                    />
                  </Card>
                ) : (
                  <PainelResumo scores={scores} onSelecionar={selecionarRegiao} />
                )}
              </div>
            </div>

            <TabelaRegioes
              scores={scores}
              municipiosPorRegiao={municipiosPorRegiao}
              selecionadaId={regiaoId}
              onSelecionar={(id) => selecionarRegiao(id === regiaoId ? undefined : id)}
            />
          </>
        )}
      </PageContent>
    </>
  );
}

function AvisoDistincao() {
  return (
    <aside className="flex gap-2.5 rounded-md border border-border bg-surface px-3.5 py-3">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <p className="text-caption leading-relaxed text-muted-foreground">
        <strong className="font-semibold text-foreground">Radar Regional não é a média dos municípios.</strong> O índice
        de cada DRS é calculado no grão da região, sobre o dado bruto regional, com a supressão de células pequenas
        (n&nbsp;&lt;&nbsp;5) decidida na própria região. Por isso uma DRS pode estar Crítica com municípios em faixas
        baixas, e o contrário. O índice de cada município está no{' '}
        <Link href="/radar" className="text-primary hover:underline">
          Radar de Risco
        </Link>
        .
      </p>
    </aside>
  );
}

function BotaoTodas({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md text-caption text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      Todas as DRS
    </button>
  );
}

function PainelResumo({
  scores,
  onSelecionar,
}: {
  scores: RiskScoreRegionalItemDTO[];
  onSelecionar: (regiaoId: number) => void;
}) {
  const contagem = contarPorClassificacao(scores);
  const destaque = scores.slice(0, 3);
  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="text-title-sm font-semibold text-foreground">Distribuição das DRS</h2>
        <p className="text-caption text-muted-foreground">Quantas regiões em cada faixa do índice regional.</p>
      </div>
      <ul className="space-y-1.5">
        {CLASSIFICACAO_ORDEM.map((classificacao) => {
          const display = getClassificacaoDisplay(classificacao);
          return (
            <li key={classificacao} className="flex items-center justify-between gap-2 text-body">
              <span className="inline-flex items-center gap-2">
                <span className={cn('h-2.5 w-2.5 shrink-0 rounded-sm', display.swatchClass)} aria-hidden />
                {display.label}
              </span>
              <span className="tabular font-medium text-foreground">{contagem[classificacao]}</span>
            </li>
          );
        })}
      </ul>
      <div>
        <p className="mb-1.5 text-label uppercase text-muted-foreground">Maiores índices</p>
        <div className="space-y-1">
          {destaque.map((score) => (
            <button
              key={score.regiaoSaude.id}
              type="button"
              onClick={() => onSelecionar(score.regiaoSaude.id)}
              className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-muted"
            >
              <span className="text-body font-medium text-foreground">{score.regiaoSaude.nome}</span>
              <span className="inline-flex items-center gap-2">
                <span className="tabular text-caption text-muted-foreground">{formatIndice(score.indice)}</span>
                <RiskBadge classificacao={score.classificacao} />
              </span>
            </button>
          ))}
        </div>
      </div>
      <p className="text-caption text-muted-foreground">
        Selecione uma DRS no mapa ou na tabela para ver os componentes do índice e os municípios que a compõem.
      </p>
    </Card>
  );
}

function PainelRegiao({
  score,
  componentes,
  municipios,
  onLimpar,
}: {
  score: RiskScoreRegionalItemDTO;
  componentes: EstadoComponentes;
  municipios: MunicipioResumoDTO[];
  onLimpar: () => void;
}) {
  const filtrosDoScore = { competenciaId: score.competencia.id, riskConfigId: score.riskConfigId, origem: score.origem };
  return (
    <Card className="space-y-4 p-4">
      <BotaoTodas onClick={onLimpar} />
      <div>
        <h2 className="text-title font-semibold text-foreground">{score.regiaoSaude.nome}</h2>
        <p className="text-caption text-muted-foreground">
          {score.regiaoSaude.codigo} · {municipios.length} municípios ·{' '}
          {formatCompetenciaLabel(score.competencia.ano, score.competencia.mes)}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="text-label uppercase text-muted-foreground">Índice regional</p>
          <p className="tabular text-title-lg font-semibold text-foreground">{formatIndice(score.indice)}</p>
        </div>
        <RiskBadge classificacao={score.classificacao} className="mb-1" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <ConfidenceBadge confiabilidade={score.confiabilidade} />
        <NatureBadge natureza={score.natureza} />
        <ProvenanceBadge origem={score.origem} />
      </div>

      <section>
        <h3 className="mb-1.5 text-title-sm font-semibold text-foreground">Componentes do índice regional</h3>
        {componentes.tipo === 'carregando' && <LoadingState label="Carregando componentes..." variant="panel" />}
        {componentes.tipo === 'erro' && <ErrorState description={componentes.mensagem} />}
        {componentes.tipo === 'pronto' && (
          <ul className="space-y-2">
            {componentes.itens.map((item) => (
              <li key={item.componente} className="rounded-md border border-border p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-body font-medium text-foreground">{getComponenteLabel(item.componente)}</span>
                  <NatureBadge natureza={item.natureza} />
                </div>
                {item.disponivel && item.valorBruto !== null ? (
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="tabular text-title-sm font-semibold text-foreground">
                      {formatNumero(item.valorBruto, 4)}
                    </span>
                    {item.valorNormalizado !== null && (
                      <span className="tabular text-caption text-muted-foreground">
                        normalizado {formatNumero(item.valorNormalizado, 2)}
                      </span>
                    )}
                    <ConfidenceBadge confiabilidade={item.confiabilidade} />
                  </div>
                ) : (
                  <div className="mt-1.5">
                    <UnavailableNote motivo={motivoIndisponibilidadeRegional(item.componente)} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {municipios.length > 0 && (
        <details className="rounded-md border border-border px-3 py-2">
          <summary className="cursor-pointer text-caption text-muted-foreground">
            <span className="tabular font-medium text-foreground">{municipios.length}</span> municípios nesta DRS — cada
            um tem o próprio índice municipal
          </summary>
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {municipios.map((m) => (
              <li key={m.id}>
                <Link href={buildMunicipioHref(m.id, filtrosDoScore)} className="text-caption text-primary hover:underline">
                  {m.nome}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Link href="/radar" className="inline-flex items-center gap-1 text-caption text-primary hover:underline">
        Índices municipais no Radar de Risco
        <ArrowRight className="h-3 w-3" aria-hidden />
      </Link>
    </Card>
  );
}

function TabelaRegioes({
  scores,
  municipiosPorRegiao,
  selecionadaId,
  onSelecionar,
}: {
  scores: RiskScoreRegionalItemDTO[];
  municipiosPorRegiao: Map<number, MunicipioResumoDTO[]>;
  selecionadaId: number | undefined;
  onSelecionar: (regiaoId: number) => void;
}) {
  return (
    <section>
      <h2 className="mb-2 text-title-sm font-semibold text-foreground">Ranking das DRS pelo índice regional</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>DRS</TableHead>
            <TableHead>Índice regional</TableHead>
            <TableHead>Classificação</TableHead>
            <TableHead>Confiabilidade</TableHead>
            <TableHead className="text-right">Municípios</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {scores.map((score, indice) => {
            const ativa = score.regiaoSaude.id === selecionadaId;
            return (
              <TableRow key={score.regiaoSaude.id} className={cn(ativa && 'bg-surface-muted')}>
                <TableCell className="tabular text-caption text-muted-foreground">{indice + 1}</TableCell>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => onSelecionar(score.regiaoSaude.id)}
                    aria-pressed={ativa}
                    className="text-left font-medium text-foreground hover:text-primary hover:underline"
                  >
                    {score.regiaoSaude.nome}
                  </button>
                  <span className="ml-2 text-label text-muted-foreground">{score.regiaoSaude.codigo}</span>
                </TableCell>
                <TableCell>
                  {/* A barra representa o indice que a API devolveu (0-1 por construcao). */}
                  <MiniBarra valor={score.indice} rotulo={formatIndice(score.indice)} />
                </TableCell>
                <TableCell>
                  <RiskBadge classificacao={score.classificacao} />
                </TableCell>
                <TableCell>
                  <ConfidenceBadge confiabilidade={score.confiabilidade} />
                </TableCell>
                <TableCell className="tabular text-right text-caption text-muted-foreground">
                  {municipiosPorRegiao.get(score.regiaoSaude.id)?.length ?? '—'}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}

export default function RegioesPage() {
  return (
    <Suspense fallback={<LoadingState label="Carregando..." variant="map" />}>
      <RegioesContent />
    </Suspense>
  );
}
