'use client';

import { Origem } from '@healthmap/contracts';
import type { CompetenciaDTO } from '@healthmap/contracts';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { getCompetencias } from '@/lib/api';
import { formatDataRefLabel } from '@/lib/format';
import { useRiskFiltersUrl } from '@/lib/use-risk-filters';

/**
 * Filtros globais do Radar: apenas os que a API realmente suporta
 * (competencia, origem - ver packages/contracts/src/risk.ts,
 * riskFiltroQuerySchema). Nao ha selecao de RiskConfig aqui porque a Fase 3
 * nao expoe um catalogo de configuracoes disponiveis - a API resolve um
 * default documentado (ver docs/fase-3-relatorio.md #7); construir esse
 * seletor exigiria hardcodar IDs no frontend, o que este projeto proibe.
 * Sincronizado com a URL via useRiskFiltersUrl - o filtro ativo e visivel
 * e compartilhavel.
 */
export function FilterBar() {
  const { filtros, setFiltro, limparFiltros, temFiltrosAtivos } = useRiskFiltersUrl();
  const [competencias, setCompetencias] = useState<CompetenciaDTO[]>([]);

  useEffect(() => {
    let cancelado = false;
    getCompetencias({ pageSize: 200 })
      .then((resposta) => {
        if (!cancelado) setCompetencias(resposta.data);
      })
      .catch(() => {
        /* selecao de competencia especifica so e degradada, o restante da pagina continua funcional */
      });
    return () => {
      cancelado = true;
    };
  }, []);

  // Sem `flex-wrap`: o PageHeader ja da rolagem horizontal a area de acoes no
  // mobile, e quebrar linha aqui anulava isso - os dois filtros empilhavam e o
  // cabecalho tomava a primeira tela inteira antes de qualquer dado.
  return (
    <div className="flex items-center gap-2">
      <label className="flex shrink-0 items-center gap-1.5 text-caption text-muted-foreground">
        Competência
        <Select
          value={filtros.competenciaId ?? ''}
          onChange={(evento) => setFiltro('competenciaId', evento.target.value || undefined)}
        >
          <option value="">Mais recente</option>
          {competencias.map((competencia) => (
            <option key={competencia.id} value={competencia.id}>
              {formatDataRefLabel(competencia.dataRef)}
            </option>
          ))}
        </Select>
      </label>

      <label className="flex shrink-0 items-center gap-1.5 text-caption text-muted-foreground">
        Origem
        <Select value={filtros.origem ?? ''} onChange={(evento) => setFiltro('origem', evento.target.value || undefined)}>
          <option value="">Todas</option>
          {Object.values(Origem).map((origem) => (
            <option key={origem} value={origem}>
              {origem}
            </option>
          ))}
        </Select>
      </label>

      {temFiltrosAtivos && (
        <Button variant="ghost" size="sm" onClick={limparFiltros} className="shrink-0 text-muted-foreground">
          <X className="h-3.5 w-3.5" aria-hidden />
          Limpar filtros
        </Button>
      )}
    </div>
  );
}
