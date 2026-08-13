import { CLASSIFICACAO_ORDEM, getClassificacaoDisplay } from '@/lib/risk-display';
import { cn } from '@/lib/utils';

/** Legenda da escala de risco - explica os 5 niveis (icone+texto+numero) para leitura sem depender so de cor. */
export function RiskScaleLegend({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {CLASSIFICACAO_ORDEM.map((classificacao) => {
        const { label, nivel, icon: Icon, textClass, bgClass, borderClass } = getClassificacaoDisplay(classificacao);
        return (
          <span
            key={classificacao}
            className={cn(
              'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium',
              textClass,
              bgClass,
              borderClass,
            )}
          >
            <Icon className="h-3 w-3" aria-hidden />
            {label}
            <span className="opacity-70">{nivel}</span>
          </span>
        );
      })}
    </div>
  );
}
