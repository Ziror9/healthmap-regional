import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Frescor dos dados: competencia exibida + timestamp real de calculo
 * (RiskScore.createdAt, via API - nunca fabricado no frontend). Se
 * `calculadoEm` nao vier (ex.: nenhum score disponivel), so a competencia
 * e mostrada.
 */
export function FreshnessIndicator({
  competenciaLabel,
  calculadoEm,
  className,
}: {
  competenciaLabel: string;
  calculadoEm?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground', className)}>
      <span className="inline-flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5" aria-hidden />
        Competência <span className="font-medium text-foreground">{competenciaLabel}</span>
      </span>
      {calculadoEm && (
        <span>
          Calculado em{' '}
          <span className="font-medium text-foreground">
            {new Date(calculadoEm).toLocaleString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </span>
      )}
    </div>
  );
}
