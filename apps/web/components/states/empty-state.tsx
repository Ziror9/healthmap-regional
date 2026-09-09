import { Inbox, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Ausencia de resultado para o filtro atual - situacao diferente de dado
 * SUPRIMIDO (ver components/states/suppressed-value.tsx) e de erro. Manter os
 * tres distinguiveis e requisito metodologico do produto, nao preferencia
 * estetica.
 */
export function EmptyState({
  title = 'Não há dados disponíveis para os filtros selecionados.',
  description,
  icon: Icon = Inbox,
  className,
  children,
}: {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-surface px-6 py-12 text-center',
        className,
      )}
    >
      <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
      <p className="text-body font-medium text-foreground">{title}</p>
      {description && <p className="max-w-sm text-caption text-muted-foreground">{description}</p>}
      {children}
    </div>
  );
}
