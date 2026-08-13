import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Padding/largura maxima consistente do conteudo de toda pagina, abaixo do PageHeader. */
export function PageContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mx-auto w-full max-w-7xl px-6 py-6 md:px-8 md:py-8', className)} {...props} />;
}
