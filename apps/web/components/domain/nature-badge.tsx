import type { Natureza } from '@healthmap/contracts';
import { Tooltip } from '@/components/ui/tooltip';
import { getNaturezaDisplay } from '@/lib/risk-display';
import { cn } from '@/lib/utils';

/** OBSERVADO / ESTIMATIVA / PROJECAO - nunca devem ser confundidos entre si. */
export function NatureBadge({ natureza, className }: { natureza: Natureza; className?: string }) {
  const { label, textClass, bgClass, borderClass, descricao } = getNaturezaDisplay(natureza);

  return (
    <Tooltip label={descricao}>
      <span
        className={cn(
          'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
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
