'use client';

import type { ClassificacaoRisco } from '@healthmap/contracts';
import { Card } from '@/components/ui/card';
import { Tooltip } from '@/components/ui/tooltip';
import { getClassificacaoDisplay } from '@/lib/risk-display';
import { cn } from '@/lib/utils';

export interface RegiaoGrupo {
  regiaoId: number;
  regiaoNome: string;
  municipios: { id: number; nome: string; classificacao: ClassificacaoRisco | null }[];
}

/**
 * Substituto do mapa geografico enquanto nao ha GeoJSON oficial nem
 * lat/long populados (ver painel "Mapa indisponivel" na Visao Geral e
 * docs/known-limitations.md #8). Agrupa os municipios por Regiao de Saude -
 * dado real, ja modelado - e usa o nivel de risco (numero + cor) por
 * municipio, nunca so cor.
 */
export function RegionHeatGrid({ grupos }: { grupos: RegiaoGrupo[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {grupos.map((grupo) => (
        <Card key={grupo.regiaoId} className="p-4">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-medium text-foreground" title={grupo.regiaoNome}>
              {grupo.regiaoNome}
            </p>
            <span className="shrink-0 text-xs text-muted-foreground">
              {grupo.municipios.length} município{grupo.municipios.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {grupo.municipios.map((municipio) => {
              if (!municipio.classificacao) {
                return (
                  <Tooltip key={municipio.id} label={`${municipio.nome} — sem índice calculado para os filtros atuais`}>
                    <span className="flex h-6 w-6 items-center justify-center rounded border border-dashed border-border bg-surface-muted text-[10px] text-muted-foreground">
                      —
                    </span>
                  </Tooltip>
                );
              }
              const display = getClassificacaoDisplay(municipio.classificacao);
              return (
                <Tooltip key={municipio.id} label={`${municipio.nome} — ${display.label} (nível ${display.nivel}/5)`}>
                  <span
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded border text-[10px] font-bold',
                      display.textClass,
                      display.bgClass,
                      display.borderClass,
                    )}
                  >
                    {display.nivel}
                  </span>
                </Tooltip>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}
