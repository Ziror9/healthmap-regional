import { cn } from '@/lib/utils';

/** Bloco de carregamento. `animate-pulse` e desligado por prefers-reduced-motion (ver globals.css). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-sm bg-surface-muted', className)} aria-hidden />;
}
