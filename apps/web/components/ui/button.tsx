import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * O anel de foco nao e declarado aqui: `:focus-visible` global (app/globals.css)
 * da o mesmo tratamento a botao, link, celula de tabela e area clicavel do
 * mapa. Antes so os componentes que lembravam de declarar tinham foco visivel.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-body font-medium ' +
    'transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        outline: 'border border-border-strong bg-surface text-foreground hover:bg-surface-muted',
        ghost: 'text-muted-foreground hover:bg-surface-muted hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-7 px-2.5 text-caption',
        default: 'h-9 px-3.5',
        icon: 'h-8 w-8 shrink-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
