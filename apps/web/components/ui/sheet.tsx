'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Painel deslizante. Usado no mobile para tirar os filtros do fluxo da
 * pagina: no diagnostico do redesign, titulo + descricao + controles
 * consumiam ~420px de uma tela de 812px antes do primeiro dado.
 *
 * Acessibilidade implementada: `role="dialog"` + `aria-modal`, Esc fecha,
 * clique no fundo fecha, o foco vai para o painel ao abrir e volta para o
 * elemento que o abriu ao fechar, e a rolagem do documento fica travada
 * enquanto aberto. NAO ha armadilha de foco (tabular pode sair do painel) -
 * limitacao registrada em docs/design-system.md.
 */
export function Sheet({
  aberto,
  onFechar,
  titulo,
  children,
  lado = 'bottom',
}: {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  children: ReactNode;
  lado?: 'bottom' | 'right';
}) {
  const refPainel = useRef<HTMLDivElement | null>(null);
  const refGatilho = useRef<Element | null>(null);

  useEffect(() => {
    if (!aberto) return;
    refGatilho.current = document.activeElement;
    refPainel.current?.focus();

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onFechar();
    };
    document.addEventListener('keydown', aoTeclar);

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = overflowAnterior;
      if (refGatilho.current instanceof HTMLElement) refGatilho.current.focus();
    };
  }, [aberto, onFechar]);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-foreground/40" onClick={onFechar} />
      <div
        ref={refPainel}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        className={cn(
          'absolute flex flex-col border-border bg-surface shadow-md',
          lado === 'bottom'
            ? 'inset-x-0 bottom-0 max-h-[85vh] rounded-t-lg border-t'
            : 'inset-y-0 right-0 w-full max-w-sm border-l',
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-title-sm font-semibold text-foreground">{titulo}</h2>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
