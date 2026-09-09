import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * REDESIGN (E1): era um bloco com spinner centralizado - a tela piscava de
 * vazia para cheia e nao dava nenhuma pista do que estava vindo. Agora
 * desenha o esqueleto da coisa que vai chegar, no lugar onde ela vai chegar.
 *
 * A API nao mudou (`label` + `className`), entao as paginas existentes
 * passam a ter skeleton sem nenhuma alteracao; `variant` escolhe a forma.
 * `label` deixa de ser texto decorativo e vira o anuncio acessivel do
 * carregamento (aria-live), que o spinner nao fazia.
 */
export type LoadingVariant = 'block' | 'map' | 'table' | 'cards' | 'panel';

function Bloco({ className }: { className?: string }) {
  return <Skeleton className={cn('h-full w-full', className)} />;
}

export function LoadingState({
  label = 'Carregando dados...',
  variant = 'block',
  className,
}: {
  label?: string;
  variant?: LoadingVariant;
  className?: string;
}) {
  return (
    <div className={cn('w-full', className)} role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>

      {variant === 'block' && <Bloco className="h-40 rounded-md" />}

      {variant === 'map' && (
        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <Skeleton className="aspect-[3/2] w-full rounded-md" />
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-md" />
            ))}
          </div>
        </div>
      )}

      {variant === 'table' && (
        <div className="overflow-hidden rounded-md border border-border">
          <Skeleton className="h-10 w-full rounded-none" />
          <div className="space-y-px p-px">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-none" />
            ))}
          </div>
        </div>
      )}

      {variant === 'cards' && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-md" />
          ))}
        </div>
      )}

      {variant === 'panel' && (
        <div className="space-y-3 rounded-md border border-border p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      )}
    </div>
  );
}
