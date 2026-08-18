import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Cabecalho de pagina - titulo, descricao curta e uma area de acoes/filtros a direita. */
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
    <div className={cn('border-b border-border bg-surface px-6 py-5 md:px-8', className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">{title}</h1>
            {titleBadge}
          </div>
          {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}
