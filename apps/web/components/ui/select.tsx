import { ChevronDown } from 'lucide-react';
import type { SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

/** Select nativo estilizado - sem dependencia de combobox (Radix nao esta instalado neste projeto). */
export function Select({ className, children, ...props }: SelectProps) {
  return (
    <div className="relative inline-flex">
      <select
        className={cn(
          'h-9 appearance-none rounded-md border border-border bg-surface py-1.5 pl-3 pr-8 text-body text-foreground',
          'transition-colors hover:border-border-strong disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </div>
  );
}
