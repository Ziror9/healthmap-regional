'use client';

import type { ClassificacaoRisco, Confiabilidade, RiskScoreItemDTO } from '@healthmap/contracts';
import { ArrowDown, ArrowUp, ArrowUpDown, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { ConfidenceBadge } from '@/components/domain/confidence-badge';
import { FilterBar } from '@/components/domain/filter-bar';
import { FreshnessIndicator } from '@/components/domain/freshness-indicator';
import { ProvenanceBadge } from '@/components/domain/provenance-badge';
import { RiskBadge } from '@/components/domain/risk-badge';
import { RiskScaleLegend } from '@/components/domain/risk-scale-legend';
import { PageContent } from '@/components/layout/page-content';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';
import { ErrorState } from '@/components/states/error-state';
import { LoadingState } from '@/components/states/loading-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiRequestError, getRisk } from '@/lib/api';
import { formatCompetenciaLabel, formatIndice } from '@/lib/format';
import { CLASSIFICACAO_ORDEM, getClassificacaoDisplay } from '@/lib/risk-display';
import { useRiskFiltersUrl } from '@/lib/use-risk-filters';
import { cn } from '@/lib/utils';

/**
 * Radar de Risco - ranking completo. Busca GET /api/risk (pageSize alto - a
 * base DEMO tem poucas dezenas de municipios) e faz ordenacao/filtro por
 * classificacao no navegador, sobre a lista ja calculada pela API. Nao ha
 * recalculo de indice, peso ou classificacao aqui.
 */

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'pronto'; itens: RiskScoreItemDTO[] };

type SortKey = 'indice' | 'municipio' | 'classificacao' | 'confiabilidade';
type SortDir = 'asc' | 'desc';

const CONFIABILIDADE_ORDEM: Record<Confiabilidade, number> = { ALTA: 3, MEDIA: 2, BAIXA: 1 };

function RadarContent() {
  const { filtros } = useRiskFiltersUrl();
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [classificacoesAtivas, setClassificacoesAtivas] = useState<Set<ClassificacaoRisco>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('indice');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    let cancelado = false;
    setEstado({ tipo: 'carregando' });

    getRisk({ ...filtros, pageSize: 200 })
      .then((resposta) => {
        if (!cancelado) setEstado({ tipo: 'pronto', itens: resposta.data });
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

  function alternarClassificacao(classificacao: ClassificacaoRisco): void {
    setClassificacoesAtivas((atual) => {
      const novo = new Set(atual);
      if (novo.has(classificacao)) novo.delete(classificacao);
      else novo.add(classificacao);
      return novo;
    });
  }

  function alternarOrdenacao(chave: SortKey): void {
    if (sortKey === chave) {
      setSortDir((atual) => (atual === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(chave);
      setSortDir(chave === 'municipio' ? 'asc' : 'desc');
    }
  }

  return (
    <>
      <PageHeader
        title="Radar de Risco"
        description="Ranking de municípios pelo índice do Radar de Risco."
        actions={<FilterBar />}
      />
      <PageContent className="space-y-4">
        {estado.tipo === 'carregando' && <LoadingState label="Carregando ranking..." />}
        {estado.tipo === 'erro' && <ErrorState description={estado.mensagem} />}
        {estado.tipo === 'pronto' && (
          <RadarPronto
            itens={estado.itens}
            classificacoesAtivas={classificacoesAtivas}
            onToggleClassificacao={alternarClassificacao}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={alternarOrdenacao}
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

function RadarPronto({
  itens,
  classificacoesAtivas,
  onToggleClassificacao,
  sortKey,
  sortDir,
  onSort,
}: {
  itens: RiskScoreItemDTO[];
  classificacoesAtivas: Set<ClassificacaoRisco>;
  onToggleClassificacao: (classificacao: ClassificacaoRisco) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (chave: SortKey) => void;
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

  const primeiroItem = itens[0];

  return (
    <div className="space-y-4">
      {primeiroItem && (
        <FreshnessIndicator
          competenciaLabel={formatCompetenciaLabel(primeiroItem.competencia.ano, primeiroItem.competencia.mes)}
          calculadoEm={primeiroItem.calculadoEm}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Classificação:</span>
          {CLASSIFICACAO_ORDEM.map((classificacao) => {
            const display = getClassificacaoDisplay(classificacao);
            const ativo = classificacoesAtivas.has(classificacao);
            const Icon = display.icon;
            return (
              <button
                key={classificacao}
                type="button"
                onClick={() => onToggleClassificacao(classificacao)}
                aria-pressed={ativo}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
                  ativo
                    ? cn(display.textClass, display.bgClass, display.borderClass)
                    : 'border-border text-muted-foreground hover:bg-surface-muted',
                )}
              >
                <Icon className="h-3 w-3" aria-hidden />
                {display.label}
              </button>
            );
          })}
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
              <TableHead>Proveniência</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itensExibidos.map((item, indice) => (
              <TableRow key={item.municipio.id}>
                <TableCell className="text-xs text-muted-foreground">{indice + 1}</TableCell>
                <TableCell>
                  <Link
                    href={`/municipios/${item.municipio.id}`}
                    className="font-medium text-foreground hover:text-primary hover:underline"
                  >
                    {item.municipio.nome}
                  </Link>
                </TableCell>
                <TableCell className="font-mono">{formatIndice(item.indice)}</TableCell>
                <TableCell>
                  <RiskBadge classificacao={item.classificacao} />
                </TableCell>
                <TableCell>
                  <ConfidenceBadge confiabilidade={item.confiabilidade} />
                </TableCell>
                <TableCell>
                  <ProvenanceBadge origem={item.origem} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
