import { Badge } from '@/components/ui/badge';

export type StatusMetodologico = 'IMPLEMENTADO' | 'PROVISORIO' | 'NAO_DEFINIDO';

const CONFIG: Record<StatusMetodologico, { label: string; variant: 'success' | 'warning' | 'muted' }> = {
  IMPLEMENTADO: { label: 'Implementado', variant: 'success' },
  PROVISORIO: { label: 'Provisório', variant: 'warning' },
  NAO_DEFINIDO: { label: 'Não definido', variant: 'muted' },
};

/** Distingue, na pagina de Metodologia, o que esta implementado do que e provisorio ou nunca foi definido - nunca a mesma aparencia para os tres. */
export function StatusMetodologicoBadge({ status }: { status: StatusMetodologico }) {
  const { label, variant } = CONFIG[status];
  return <Badge variant={variant}>{label}</Badge>;
}
