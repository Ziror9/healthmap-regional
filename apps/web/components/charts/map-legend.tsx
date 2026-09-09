import { cn } from '@/lib/utils';

/**
 * Legenda de escala do mapa.
 *
 * Implementacao unica para as duas escalas do produto (classificacao do Radar
 * e quantis do Radar Municipal) - as faixas chegam prontas de quem ja as
 * possui. Nada aqui classifica, corta ou recalcula: a contagem por faixa e
 * uma CONTAGEM de itens que a API ja devolveu classificados, no mesmo espirito
 * dos KPIs de apresentacao da Visao Geral.
 *
 * A faixa "sem dado" entra na legenda de proposito e SEPARADA da rampa: o
 * cinza do mapa precisa ser explicavel, e ausencia nao e um degrau da escala
 * (nunca deve ser lida como "valor baixo").
 */
export interface FaixaLegenda {
  chave: string;
  label: string;
  /** Classe de fundo (`bg-*`) - a mesma cor que o mapa usa via `fill-*`. */
  swatchClass: string;
  /** Municipios nesta faixa. `undefined` quando a contagem nao se aplica. */
  quantidade?: number;
  /** Intervalo de valores da faixa, quando existe (quantis). */
  intervalo?: string;
}

export function EscalaLegenda({
  faixas,
  semDado,
  descricao,
  className,
}: {
  /** Da MENOR para a MAIOR intensidade - a ordem de leitura da escala. */
  faixas: FaixaLegenda[];
  semDado?: { quantidade: number; motivo: string };
  descricao?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end gap-x-4 gap-y-2', className)}>
      <div className="flex items-end gap-3">
        <div className="flex items-end">
          {faixas.map((faixa, indice) => (
            <div key={faixa.chave} className="flex flex-col items-center">
              <span
                className={cn(
                  'h-3 w-8 border-y border-border first:rounded-l-sm first:border-l last:rounded-r-sm last:border-r',
                  faixa.swatchClass,
                )}
                title={`${faixa.label}${faixa.intervalo ? ` · ${faixa.intervalo}` : ''}`}
                aria-hidden
              />
              <span className="mt-1 text-label tabular text-muted-foreground">
                {faixa.quantidade === undefined ? indice + 1 : faixa.quantidade}
              </span>
            </div>
          ))}
        </div>
        <p className="pb-3.5 text-label uppercase text-muted-foreground">
          {faixas[0]?.label} → {faixas[faixas.length - 1]?.label}
        </p>
      </div>

      {semDado && semDado.quantidade > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-8 rounded-sm border border-dashed border-border bg-unavailable-bg" aria-hidden />
          <span className="text-label text-muted-foreground">
            <span className="tabular">{semDado.quantidade}</span> sem dado — {semDado.motivo}
          </span>
        </div>
      )}

      {descricao && <p className="text-label text-muted-foreground">{descricao}</p>}

      {/* Leitura textual completa da escala, para quem nao percebe a cor. */}
      <span className="sr-only">
        Escala, da menor para a maior intensidade:{' '}
        {faixas
          .map((f) => `${f.label}${f.quantidade === undefined ? '' : `, ${f.quantidade} municípios`}`)
          .join('; ')}
        {semDado && semDado.quantidade > 0 ? `; ${semDado.quantidade} municípios sem dado disponível.` : '.'}
      </span>
    </div>
  );
}
