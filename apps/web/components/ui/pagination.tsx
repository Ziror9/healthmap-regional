'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Paginacao CLIENT-SIDE sobre uma lista ja carregada por inteiro.
 *
 * O Radar carrega os 645 municipios de uma vez (getTodosRisk pagina por baixo
 * dos panos) e ordenava/filtrava tudo em memoria - a paginacao aqui nao muda
 * o que e buscado, so quantas linhas vao para o DOM. Nenhuma requisicao nova
 * e feita ao trocar de pagina.
 */
export function Pagination({
  pagina,
  totalPaginas,
  totalItens,
  intervalo,
  onMudarPagina,
}: {
  pagina: number;
  totalPaginas: number;
  totalItens: number;
  /** [primeiro, ultimo] item exibido, em base 1. */
  intervalo: [number, number];
  onMudarPagina: (pagina: number) => void;
}) {
  if (totalPaginas <= 1) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1">
      <p className="text-caption text-muted-foreground">
        <span className="tabular">
          {intervalo[0]}–{intervalo[1]}
        </span>{' '}
        de <span className="tabular">{totalItens}</span>
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onMudarPagina(pagina - 1)}
          disabled={pagina <= 1}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          Anterior
        </Button>
        <span className="tabular px-2 text-caption text-muted-foreground">
          {pagina} / {totalPaginas}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onMudarPagina(pagina + 1)}
          disabled={pagina >= totalPaginas}
          aria-label="Próxima página"
        >
          Próxima
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
