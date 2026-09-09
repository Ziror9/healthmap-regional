'use client';

import type { ClassificacaoRisco, Confiabilidade, RiskFiltroResolvidoDTO, RiskScoreItemDTO } from '@healthmap/contracts';
import { ArrowDown, ArrowUp, ArrowUpDown, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { ConfidenceBadge } from '@/components/domain/confidence-badge';
import { FilterBar } from '@/components/domain/filter-bar';
import { FiltrosResponsivos } from '@/components/domain/filtros-responsivos';
import { FreshnessIndicator } from '@/components/domain/freshness-indicator';
import { ProvenanceBadge } from '@/components/domain/provenance-badge';
import { MiniBarra } from '@/components/domain/rank-bar';
import { RiskBadge } from '@/components/domain/risk-badge';
import { RiskScaleLegend } from '@/components/domain/risk-scale-legend';
import { PageContent } from '@/components/layout/page-content';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';
import { ErrorState } from '@/components/states/error-state';
import { LoadingState } from '@/components/states/loading-state';
import { Pagination } from '@/components/ui/pagination';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiRequestError, getTodosRisk } from '@/lib/api';
import { formatCompetenciaLabel, formatIndice } from '@/lib/format';
import { CLASSIFICACAO_ORDEM, getClassificacaoDisplay } from '@/lib/risk-display';
import { buildMunicipioHref, useRiskFiltersUrl } from '@/lib/use-risk-filters';
import { cn } from '@/lib/utils';

/**
 * Radar de Risco - ranking completo. Busca GET /api/risk paginando ate o fim
 * (getTodosRisk: sao 645 municipios REAL, acima do teto de 200 por pagina) e
 * faz ordenacao/filtro por classificacao no navegador, sobre a lista ja
 * calculada pela API. Nao ha recalculo de indice, peso ou classificacao aqui.
 */

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'pronto'; itens: RiskScoreItemDTO[]; meta: RiskFiltroResolvidoDTO };

type SortKey = 'indice' | 'municipio' | 'classificacao' | 'confiabilidade';
type SortDir = 'asc' | 'desc';

const CONFIABILIDADE_ORDEM: Record<Confiabilidade, number> = { ALTA: 3, MEDIA: 2, BAIXA: 1 };

function RadarContent() {
  const { filtros } = useRiskFiltersUrl();
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [classificacoesAtivas, setClassificacoesAtivas] = useState<Set<ClassificacaoRisco>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('indice');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    let cancelado = false;
    setEstado({ tipo: 'carregando' });

    // Real-first (Fase 5.9): o ranking do produto e sobre a base REAL. Sem
    // esse default a pagina resolve para a competencia mais recente com
    // RiskScore - que hoje e DEMO (2025) - e o ranking "do estado" aparece
    // com 3 municipios sinteticos. O filtro de origem sobrepoe.
    getTodosRisk({ ...filtros, origem: filtros.origem ?? 'REAL' })
      .then((resposta) => {
        if (!cancelado) setEstado({ tipo: 'pronto', itens: resposta.data, meta: resposta.meta.filtros });
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

  // Filtrar ou reordenar muda QUAIS linhas existem: manter a pagina 15 depois
  // disso mostraria uma pagina vazia ou um recorte sem relacao com a acao.
  function alternarClassificacao(classificacao: ClassificacaoRisco): void {
    setPagina(1);
    setClassificacoesAtivas((atual) => {
      const novo = new Set(atual);
      if (novo.has(classificacao)) novo.delete(classificacao);
      else novo.add(classificacao);
      return novo;
    });
  }

  function alternarOrdenacao(chave: SortKey): void {
    setPagina(1);
    if (sortKey === chave) {
      setSortDir((atual) => (atual === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(chave);
      setSortDir(chave === 'municipio' ? 'asc' : 'desc');
    }
  }

  const quantidadeFiltrosAtivos =
    (filtros.competenciaId !== undefined ? 1 : 0) +
    (filtros.origem !== undefined ? 1 : 0) +
    (classificacoesAtivas.size > 0 ? 1 : 0);

  return (
    <>
      <PageHeader
        title="Radar de Risco"
        description="Ranking de municípios pelo índice do Radar de Risco."
        actions={
          <FiltrosResponsivos quantidadeAtiva={quantidadeFiltrosAtivos}>
            <FilterBar />
          </FiltrosResponsivos>
        }
      />
      <PageContent className="space-y-4">
        {estado.tipo === 'carregando' && <LoadingState label="Carregando ranking..." variant="table" />}
        {estado.tipo === 'erro' && <ErrorState description={estado.mensagem} />}
        {estado.tipo === 'pronto' && (
          <RadarPronto
            itens={estado.itens}
            meta={estado.meta}
            classificacoesAtivas={classificacoesAtivas}
            onToggleClassificacao={alternarClassificacao}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={alternarOrdenacao}
            pagina={pagina}
            onMudarPagina={setPagina}
          />
        )}
      </PageContent>
    </>
  );
}

function SortHeader({
  label,
  chave,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  chave: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (chave: SortKey) => void;
}) {
  const ativo = sortKey === chave;
  const Icon: LucideIcon = !ativo ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(chave)}
      className={cn('inline-flex items-center gap-1 hover:text-foreground', ativo && 'text-foreground')}
    >
      {label}
      <Icon className="h-3 w-3" aria-hidden />
    </button>
  );
}

const POR_PAGINA = 50;

function RadarPronto({
  itens,
  meta,
  classificacoesAtivas,
  onToggleClassificacao,
  sortKey,
  sortDir,
  onSort,
  pagina,
  onMudarPagina,
}: {
  itens: RiskScoreItemDTO[];
  meta: RiskFiltroResolvidoDTO;
  classificacoesAtivas: Set<ClassificacaoRisco>;
  onToggleClassificacao: (classificacao: ClassificacaoRisco) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (chave: SortKey) => void;
  pagina: number;
  onMudarPagina: (pagina: number) => void;
}) {
  const itensExibidos = useMemo(() => {
    const base = classificacoesAtivas.size === 0 ? itens : itens.filter((item) => classificacoesAtivas.has(item.classificacao));
    const sinal = sortDir === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => {
      if (sortKey === 'indice') return (a.indice - b.indice) * sinal;
      if (sortKey === 'municipio') return a.municipio.nome.localeCompare(b.municipio.nome) * sinal;
      if (sortKey === 'classificacao') {
        return (getClassificacaoDisplay(a.classificacao).nivel - getClassificacaoDisplay(b.classificacao).nivel) * sinal;
      }
      return (CONFIABILIDADE_ORDEM[a.confiabilidade] - CONFIABILIDADE_ORDEM[b.confiabilidade]) * sinal;
    });
  }, [itens, classificacoesAtivas, sortKey, sortDir]);

  /** Quantos municipios em cada faixa - contagem dos itens que a API ja
   *  devolveu classificados, exibida no proprio chip de filtro. Nenhum limiar
   *  ou classificacao acontece aqui. */
  const contagemPorClassificacao = useMemo(() => {
    const zerado: Record<ClassificacaoRisco, number> = { CRITICO: 0, ALTO: 0, MEDIO: 0, BAIXO: 0, MUITO_BAIXO: 0 };
    for (const item of itens) zerado[item.classificacao] += 1;
    return zerado;
  }, [itens]);

  const totalPaginas = Math.max(1, Math.ceil(itensExibidos.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * POR_PAGINA;
  const itensDaPagina = itensExibidos.slice(inicio, inicio + POR_PAGINA);

  const primeiroItem = itens[0];

  return (
    <div className="space-y-4">
      {primeiroItem && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="inline-flex items-center text-xs text-muted-foreground">
            Ranking calculado sobre{' '}
            <ProvenanceBadge origem={meta.origem ?? primeiroItem.origem} className="mx-1.5 align-middle" />
          </span>
          <FreshnessIndicator
            competenciaLabel={formatCompetenciaLabel(primeiroItem.competencia.ano, primeiroItem.competencia.mes)}
            calculadoEm={primeiroItem.calculadoEm}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-label uppercase text-muted-foreground">Classificação</span>
          {CLASSIFICACAO_ORDEM.map((classificacao) => {
            const display = getClassificacaoDisplay(classificacao);
            const ativo = classificacoesAtivas.has(classificacao);
            return (
              <button
                key={classificacao}
                type="button"
                onClick={() => onToggleClassificacao(classificacao)}
                aria-pressed={ativo}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-caption font-medium transition-colors',
                  ativo
                    ? cn(display.textClass, display.bgClass, display.borderClass)
                    : 'border-border text-muted-foreground hover:bg-surface-muted',
                )}
              >
                <span className={cn('h-2 w-2 shrink-0 rounded-sm', display.swatchClass)} aria-hidden />
                {display.label}
                <span className="tabular opacity-70">{contagemPorClassificacao[classificacao]}</span>
              </button>
            );
          })}
          {classificacoesAtivas.size > 0 && (
            <span className="tabular text-caption text-muted-foreground">
              {itensExibidos.length} de {itens.length}
            </span>
          )}
        </div>
        <RiskScaleLegend className="hidden lg:flex" />
      </div>

      {itensExibidos.length === 0 ? (
        <EmptyState
          title="Nenhum município corresponde aos filtros."
          description="Ajuste a competência, a origem ou a classificação selecionada."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>
                <SortHeader label="Município" chave="municipio" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              </TableHead>
              <TableHead>
                <SortHeader label="Índice" chave="indice" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              </TableHead>
              <TableHead>
                <SortHeader label="Classificação" chave="classificacao" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              </TableHead>
              <TableHead>
                <SortHeader label="Confiabilidade" chave="confiabilidade" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itensDaPagina.map((item, indice) => (
              <TableRow key={item.municipio.id}>
                <TableCell className="tabular text-caption text-muted-foreground">{inicio + indice + 1}</TableCell>
                <TableCell>
                  <Link
                    href={buildMunicipioHref(item.municipio.id, {
                      competenciaId: item.competencia.id,
                      riskConfigId: item.riskConfigId,
                      origem: item.origem,
                    })}
                    className="font-medium text-foreground hover:text-primary hover:underline"
                  >
                    {item.municipio.nome}
                  </Link>
                </TableCell>
                <TableCell>
                  {/* A barra REPRESENTA o indice que a API ja devolveu (escala
                      0-1 por construcao); o numero continua ao lado. Nao ha
                      calculo de risco aqui. */}
                  <MiniBarra valor={item.indice} rotulo={formatIndice(item.indice)} />
                </TableCell>
                <TableCell>
                  <RiskBadge classificacao={item.classificacao} />
                </TableCell>
                <TableCell>
                  <ConfidenceBadge confiabilidade={item.confiabilidade} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {itensExibidos.length > 0 && (
        <Pagination
          pagina={paginaAtual}
          totalPaginas={totalPaginas}
          totalItens={itensExibidos.length}
          intervalo={[inicio + 1, inicio + itensDaPagina.length]}
          onMudarPagina={onMudarPagina}
        />
      )}
    </div>
  );
}

export default function RadarPage() {
  return (
    <Suspense fallback={<LoadingState label="Carregando..." />}>
      <RadarContent />
    </Suspense>
  );
}
