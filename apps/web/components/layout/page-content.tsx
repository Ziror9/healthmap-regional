import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Padding/largura maxima consistente do conteudo de toda pagina, abaixo do PageHeader. */
export function PageContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mx-auto w-full max-w-[1180px] px-4 py-5 md:px-6 md:py-7', className)} {...props} />;
}
