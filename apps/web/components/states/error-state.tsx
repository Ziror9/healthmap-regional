import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ErrorState({
  title = 'Não foi possível carregar os dados.',
  description,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-md border border-danger/30 bg-danger/5 px-6 py-12 text-center',
        className,
      )}
    >
      <AlertTriangle className="h-5 w-5 text-danger" aria-hidden />
      <div>
        <p className="text-body font-medium text-foreground">{title}</p>
        {description && <p className="mt-1 max-w-sm text-caption text-muted-foreground">{description}</p>}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}
