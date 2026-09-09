import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Indicador de destaque da Visao Geral.
 *
 * REDESIGN (E3), duas mudancas:
 *
 * 1. Deixou de ser um Card com borda propria. Quatro caixas identicas lado a
 *    lado gastavam borda, raio e fundo para dizer "somos quatro objetos
 *    separados" - o que achatava a hierarquia da pagina inteira. Agora os
 *    quatro dividem UM bloco (ver PainelIndicadores), separados por regua de
 *    1px. Menos moldura, mesma leitura.
 * 2. Passou a carregar FONTE e PERIODO. Antes o numero aparecia sozinho: um
 *    gestor lendo "34,4/10 mil" nao sabia se vinha do SIH ou do SIM, nem de
 *    que ano - e o produto inteiro se apoia em dizer de onde cada numero vem
 *    (CLAUDE.md, invariante 2).
 *
 * Nada aqui calcula: os valores chegam prontos de agregacao de apresentacao
 * (contagem, maximo) sobre listas ja materializadas pela API.
 */
export function KpiCard({
  label,
  value,
  unit,
  hint,
  fonte,
  periodo,
  icon: Icon,
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  /** Contexto curto do numero (o municipio, o recorte). */
  hint?: string;
  /** De onde o numero vem. Obrigatorio: numero sem fonte nao entra nesta tela. */
  fonte: string;
  /** Competencia ou ano a que o numero se refere. */
  periodo: string;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1 bg-surface p-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-label uppercase text-muted-foreground">{label}</p>
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
      </div>

      <p className="tabular text-figure font-semibold text-foreground">
        {value}
        {unit && <span className="ml-1 text-title-sm font-normal text-muted-foreground">{unit}</span>}
      </p>

      {hint && <p className="text-caption text-muted-foreground">{hint}</p>}

      <p className="mt-auto pt-2 text-label text-muted-foreground/80">
        {fonte} · {periodo}
      </p>
    </div>
  );
}

/**
 * Agrupa os indicadores num unico bloco. O `gap-px` sobre fundo de borda
 * desenha as reguas divisorias sem que cada tile precise da propria borda -
 * e o que faz os quatro lerem como um painel, e nao como quatro cartoes.
 */
export function PainelIndicadores({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2 xl:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  );
}
