import type { ClassificacaoRisco } from '@healthmap/contracts';
import { getClassificacaoDisplay } from '@/lib/risk-display';
import { cn } from '@/lib/utils';

/**
 * Classificacao de risco: nunca so cor. Sempre icone + rotulo em texto +
 * nivel numerico (1-5), para nao depender de percepcao de cor.
 */
export function RiskBadge({ classificacao, className }: { classificacao: ClassificacaoRisco; className?: string }) {
  const { label, nivel, icon: Icon, textClass, bgClass, borderClass } = getClassificacaoDisplay(classificacao);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold',
        textClass,
        bgClass,
        borderClass,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {label}
      <span className="font-normal opacity-70">Nível {nivel}/5</span>
    </span>
  );
}
