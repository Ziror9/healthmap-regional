import { EyeOff } from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Um valor indisponivel (componente do Radar sem metodologia definida, ou
 * celula suprimida por n < 5) NUNCA aparece como "0" ou "-". Sempre este
 * tratamento visual explicito, com o motivo real.
 */
export function UnavailableNote({
  motivo,
  compact = false,
  className,
}: {
  motivo: string;
  compact?: boolean;
  className?: string;
}) {
  if (compact) {
    return (
      <Tooltip label={motivo}>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border border-dashed border-border bg-surface-muted px-2 py-1 text-xs font-medium text-muted-foreground',
            className,
          )}
        >
          <EyeOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Indisponível
        </span>
      </Tooltip>
    );
  }

  return (
    <div className={cn('flex items-start gap-2.5 rounded-md border border-dashed border-border bg-surface-muted p-3', className)}>
      <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div>
        <p className="text-xs font-semibold text-foreground">Indisponível</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{motivo}</p>
      </div>
    </div>
  );
}
