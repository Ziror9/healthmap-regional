import { EyeOff, Minus } from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Quatro ausencias diferentes, quatro tratamentos diferentes.
 *
 * Esta e a distincao metodologicamente mais importante da interface, e ate
 * aqui o produto tinha um tratamento so (`UnavailableNote`) para todas. Sao
 * conclusoes distintas para quem le:
 *
 *   - `suprimido`  -> o valor EXISTE e e maior que zero, mas e menor que 5 e
 *                     nao pode ser publicado (regra de privacidade n<5).
 *                     Nunca vira 0, nunca e estimado, nunca e interpolado.
 *   - `sem-dado`   -> nao ha registro para este municipio/ano nesta fonte.
 *   - `sem-metodo` -> o indicador existe estruturalmente, mas a metodologia
 *                     nunca foi definida (Tendencia, Severidade).
 *   - `zero`       -> o valor medido e efetivamente zero. E um dado, nao uma
 *                     ausencia, e por isso e o unico que aparece como numero.
 *
 * "Menos de 5 casos" e "nenhum caso" levam a decisoes de saude publica
 * diferentes; a interface nao pode empurrar as duas para o mesmo pixel.
 */
export type TipoAusencia = 'suprimido' | 'sem-dado' | 'sem-metodo' | 'zero';

const ROTULO: Record<Exclude<TipoAusencia, 'zero'>, { curto: string; explicacao: string }> = {
  suprimido: {
    curto: 'Suprimido',
    explicacao:
      'Menos de 5 casos no período. O valor existe, mas não pode ser divulgado por privacidade — não é zero e não foi estimado.',
  },
  'sem-dado': {
    curto: 'Sem registro',
    explicacao: 'Não há registro para este município neste período na fonte consultada.',
  },
  'sem-metodo': {
    curto: 'Sem metodologia',
    explicacao: 'O indicador está previsto, mas a metodologia de cálculo ainda não foi definida.',
  },
};

/** Versao inline, para celula de tabela e lista - ocupa o lugar do numero. */
export function SuppressedValue({
  tipo,
  motivo,
  className,
}: {
  tipo: Exclude<TipoAusencia, 'zero'>;
  /** Motivo especifico vindo da API. Quando ausente, usa a explicacao padrao do tipo. */
  motivo?: string;
  className?: string;
}) {
  const { curto, explicacao } = ROTULO[tipo];
  return (
    <Tooltip label={motivo ?? explicacao}>
      <span
        className={cn(
          'inline-flex items-center gap-1 text-caption font-medium text-unavailable',
          className,
        )}
      >
        <Minus className="h-3 w-3 shrink-0" aria-hidden />
        {curto}
      </span>
    </Tooltip>
  );
}

/** Versao em bloco, para painel e cartao - quando ha espaco para o motivo por extenso. */
export function SuppressedBlock({
  tipo,
  motivo,
  className,
}: {
  tipo: Exclude<TipoAusencia, 'zero'>;
  motivo?: string;
  className?: string;
}) {
  const { curto, explicacao } = ROTULO[tipo];
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-md border border-dashed border-border bg-unavailable-bg p-3',
        className,
      )}
    >
      <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-unavailable" aria-hidden />
      <div>
        <p className="text-caption font-semibold text-foreground">{curto}</p>
        <p className="mt-0.5 text-caption leading-relaxed text-muted-foreground">{motivo ?? explicacao}</p>
      </div>
    </div>
  );
}
