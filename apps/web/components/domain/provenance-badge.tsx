import type { Origem } from '@healthmap/contracts';
import { Tooltip } from '@/components/ui/tooltip';
import { getOrigemDisplay } from '@/lib/risk-display';
import { cn } from '@/lib/utils';

/** REAL / DEMO. DEMO precisa ser imediatamente reconhecivel, sem poluir a interface. */
export function ProvenanceBadge({ origem, className }: { origem: Origem; className?: string }) {
  const { label, textClass, bgClass, borderClass, descricao } = getOrigemDisplay(origem);

  return (
    <Tooltip label={descricao}>
      <span
        className={cn(
          'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide',
          textClass,
          bgClass,
          borderClass,
          className,
        )}
      >
        {label}
      </span>
    </Tooltip>
  );
}
