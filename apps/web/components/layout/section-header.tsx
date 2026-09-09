import { cn } from '@/lib/utils';

/** Cabecalho de secao dentro de uma pagina - um nivel abaixo do PageHeader. */
export function SectionHeader({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn('mb-3', className)}>
      <h2 className="text-title font-semibold text-foreground">{title}</h2>
      {description && <p className="mt-0.5 text-caption leading-relaxed text-muted-foreground">{description}</p>}
    </div>
  );
}
