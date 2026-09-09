import type { ClassificacaoRisco } from '@healthmap/contracts';
import { getClassificacaoDisplay } from '@/lib/risk-display';
import { cn } from '@/lib/utils';

/**
 * Classificacao de risco: nunca so cor. Sempre rotulo em texto + nivel
 * numerico (1-5), para nao depender de percepcao de cor.
 *
 * REDESIGN (E1): o icone por nivel deu lugar a um swatch da rampa
 * sequencial. Motivo: o icone era redundancia contra daltonismo, papel que
 * "Nivel 3/5" ja cumpre de forma mais precisa; o swatch, por outro lado,
 * mostra a POSICAO na escala - e o que faltava para o chip conversar com a
 * legenda e com o mapa. O icone continua exportado por
 * getClassificacaoDisplay e segue em uso onde ha espaco (filtros do Radar).
 */
export function RiskBadge({ classificacao, className }: { classificacao: ClassificacaoRisco; className?: string }) {
  const { label, nivel, textClass, bgClass, borderClass, swatchClass } = getClassificacaoDisplay(classificacao);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold',
        textClass,
        bgClass,
        borderClass,
        className,
      )}
    >
      <span className={cn('h-2.5 w-2.5 shrink-0 rounded-sm', swatchClass)} aria-hidden />
      {label}
      <span className="tabular font-normal opacity-70">{nivel}/5</span>
    </span>
  );
}
