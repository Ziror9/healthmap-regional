import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Cabecalho de pagina - titulo, descricao curta e uma area de acoes/filtros.
 *
 * REDESIGN (E1): o titulo passou a usar a escala tipografica nomeada
 * (`text-display`), abrindo distancia real entre H1, secao e corpo - o
 * diagnostico registrou que quase toda a interface vivia entre 11px e 14px, e
 * a hierarquia dependia so do peso da fonte. No mobile os filtros descem para
 * uma linha propria com rolagem horizontal, em vez de empilharem: o
 * cabecalho consumia dois tercos da primeira tela antes de qualquer dado.
 */
export function PageHeader({
  title,
  titleBadge,
  description,
  actions,
  className,
}: {
  title: string;
  /** Badge curto ao lado do titulo (ex.: ProvenanceBadge REAL/DEMO) - so quando agrega informacao que o titulo sozinho nao da. */
  titleBadge?: ReactNode;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('border-b border-border bg-surface px-4 py-4 md:px-6 md:py-5', className)}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-title-lg font-semibold text-foreground md:text-display">{title}</h1>
            {titleBadge}
          </div>
          {description && (
            <p className="mt-1 max-w-2xl text-body text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && (
          <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-0.5 lg:mx-0 lg:flex-wrap lg:justify-end lg:px-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
