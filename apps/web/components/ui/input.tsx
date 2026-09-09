import type { InputHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Icone decorativo a esquerda (ex.: lupa numa busca). Nunca substitui o rotulo acessivel. */
  icon?: LucideIcon;
};

/**
 * Campo de texto/busca. Existe porque a busca de /municipios era um <input>
 * com classes soltas - a unica no produto, e ja divergente do Select ao lado.
 */
export function Input({ className, icon: Icon, ...props }: InputProps) {
  return (
    <div className="relative inline-flex w-full items-center">
      {Icon && (
        <Icon className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      )}
      <input
        className={cn(
          'h-9 w-full rounded-md border border-border bg-surface py-1.5 text-body text-foreground',
          'placeholder:text-muted-foreground disabled:opacity-50',
          Icon ? 'pl-8 pr-3' : 'px-3',
          className,
        )}
        {...props}
      />
    </div>
  );
}
