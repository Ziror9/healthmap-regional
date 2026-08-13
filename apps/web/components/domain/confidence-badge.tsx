import type { Confiabilidade } from '@healthmap/contracts';
import { Tooltip } from '@/components/ui/tooltip';
import { getConfiabilidadeDisplay } from '@/lib/risk-display';
import { cn } from '@/lib/utils';

export function ConfidenceBadge({
  confiabilidade,
  className,
}: {
  confiabilidade: Confiabilidade;
  className?: string;
}) {
  const { label, icon: Icon, textClass, bgClass, borderClass, descricao } = getConfiabilidadeDisplay(confiabilidade);

  return (
    <Tooltip label={descricao}>
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium',
          textClass,
          bgClass,
          borderClass,
          className,
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {label}
      </span>
    </Tooltip>
  );
}
