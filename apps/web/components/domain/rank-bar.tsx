import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Linha de ranking com barra proporcional.
 *
 * REDESIGN (E3): as listas de "polos de atendimento" e "municipios em maior
 * atencao" eram cartoes empilhados com um numero a direita. Comparar 19.584
 * com 8.186 exigia ler e dividir - a barra faz a comparacao acontecer antes
 * da leitura, que e o ponto de um ranking.
 *
 * A barra representa o valor em relacao ao MAIOR valor da lista (nao a um
 * total): a pergunta que ela responde e "quao grande e este, comparado ao
 * primeiro", nao "que fracao do estado e este". Somar polos daria um total
 * sem significado - um paciente pode ser contado em pares distintos.
 */
export function RankBar({
  posicao,
  nome,
  valor,
  valorFormatado,
  maximo,
  contexto,
  href,
  acessorio,
  onClick,
}: {
  posicao?: number;
  nome: string;
  valor: number;
  valorFormatado: string;
  /** Maior valor da lista - denominador da barra. */
  maximo: number;
  contexto?: string;
  href?: string;
  /** Elemento a direita do valor (ex.: RiskBadge). */
  acessorio?: ReactNode;
  onClick?: () => void;
}) {
  const proporcao = maximo > 0 ? Math.max(0.02, valor / maximo) : 0;

  const conteudo = (
    <>
      {/* Barra ao fundo: informacao, nao decoracao - por isso fica atras do
          texto, e nao numa coluna propria que roubaria largura do nome. */}
      <span
        className="absolute inset-y-0 left-0 rounded-sm bg-surface-muted transition-[width]"
        style={{ width: `${proporcao * 100}%` }}
        aria-hidden
      />
      <span className="relative flex min-w-0 items-baseline gap-2">
        {posicao !== undefined && (
          <span className="tabular w-4 shrink-0 text-label text-muted-foreground">{posicao}</span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-body font-medium text-foreground">{nome}</span>
          {contexto && <span className="block truncate text-label text-muted-foreground">{contexto}</span>}
        </span>
      </span>
      <span className="relative flex shrink-0 items-center gap-2">
        <span className="tabular text-body text-foreground">{valorFormatado}</span>
        {acessorio}
      </span>
    </>
  );

  const classe = cn(
    'relative flex items-center justify-between gap-3 overflow-hidden rounded-sm px-2 py-1.5',
    'transition-colors hover:bg-surface-muted/60',
  );

  if (href) {
    return (
      <Link href={href} className={classe}>
        {conteudo}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(classe, 'w-full text-left')}>
        {conteudo}
      </button>
    );
  }
  return <div className={classe}>{conteudo}</div>;
}

/**
 * Barra proporcional compacta para dentro de celula de tabela - mesma ideia
 * da RankBar, sem a linha inteira.
 *
 * REPRESENTA um valor que ja existe; nao calcula nada. A largura e o valor
 * dividido pelo maximo da escala (o indice do Radar e 0-1 por construcao,
 * entao `maximo` e 1), e o numero continua visivel ao lado - a barra e
 * redundancia visual, nunca a unica forma de ler o valor.
 */
export function MiniBarra({
  valor,
  maximo = 1,
  rotulo,
  className,
}: {
  valor: number;
  maximo?: number;
  /** Texto ja formatado do valor. */
  rotulo: string;
  className?: string;
}) {
  const proporcao = maximo > 0 ? Math.min(1, Math.max(0, valor / maximo)) : 0;
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <span className="tabular w-9 shrink-0 text-body text-foreground">{rotulo}</span>
      <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
        <span className="block h-full rounded-full bg-foreground/35" style={{ width: `${proporcao * 100}%` }} />
      </span>
    </span>
  );
}
