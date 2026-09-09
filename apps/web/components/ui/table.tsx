import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Tabela com scroll horizontal proprio - a pagina nunca deve rolar na
 * horizontal por causa de uma tabela larga.
 *
 * REDESIGN (E1): ganhou cabecalho fixo. Listas do produto tem 645 linhas
 * (catalogo de municipios, ranking do Radar); ao rolar, perdia-se a
 * referencia das colunas. `maxHeight` limita a area de rolagem interna -
 * sem ela, `position: sticky` no <thead> nao tem contra o que grudar.
 */
export function Table({
  className,
  maxHeight = '70vh',
  ...props
}: HTMLAttributes<HTMLTableElement> & { maxHeight?: string }) {
  return (
    <div
      className="w-full overflow-auto rounded-md border border-border bg-surface"
      style={{ maxHeight }}
    >
      <table className={cn('w-full border-collapse text-body', className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        'sticky top-0 z-10 bg-surface-muted text-left text-label uppercase text-muted-foreground',
        'after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border after:content-[""]',
        className,
      )}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn(className)} {...props} />;
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-t border-border transition-colors hover:bg-surface-muted/70', className)} {...props} />;
}

export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('whitespace-nowrap px-3 py-2.5 font-medium', className)} {...props} />;
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2 align-middle', className)} {...props} />;
}
