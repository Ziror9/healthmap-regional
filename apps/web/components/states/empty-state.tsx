import { Inbox, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

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
        'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface py-16 text-center',
        className,
      )}
    >
      <Icon className="h-6 w-6 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      {children}
    </div>
  );
}
