import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Tooltip so-CSS (group-hover/focus-within) - sem JS, sem dependencia nova.
 * Acessivel via teclado (group-focus-within) e visivel em hover para mouse.
 */
export function Tooltip({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('group relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-xs -translate-x-1/2 rounded-md',
          'bg-foreground px-2.5 py-1.5 text-xs leading-snug text-background opacity-0 shadow-md transition-opacity',
          'duration-150 group-hover:opacity-100 group-focus-within:opacity-100',
        )}
      >
        {label}
      </span>
    </span>
  );
}
