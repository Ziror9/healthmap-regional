import { cn } from '@/lib/utils';

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
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {description && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>}
    </div>
  );
}
