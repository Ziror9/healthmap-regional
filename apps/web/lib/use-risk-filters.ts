'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

/**
 * Filtros globais do Radar (competencia/riskConfig/origem), sincronizados
 * com a URL - o filtro ativo fica visivel/compartilhavel, e volta ao
 * navegar/atualizar a pagina. Mesmos 3 parametros aceitos por
 * GET /api/risk (packages/contracts/src/risk.ts, riskFiltroQuerySchema) -
 * nao existe filtro aqui que a API nao suporte.
 */
export interface RiskFiltersState {
  competenciaId?: number;
  riskConfigId?: number;
  origem?: 'REAL' | 'DEMO';
}

export function useRiskFiltersUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filtros = useMemo<RiskFiltersState>(() => {
    const competenciaId = searchParams.get('competenciaId');
    const riskConfigId = searchParams.get('riskConfigId');
    const origem = searchParams.get('origem');
    return {
      competenciaId: competenciaId ? Number(competenciaId) : undefined,
      riskConfigId: riskConfigId ? Number(riskConfigId) : undefined,
      origem: origem === 'REAL' || origem === 'DEMO' ? origem : undefined,
    };
  }, [searchParams]);

  const setFiltro = useCallback(
    (chave: keyof RiskFiltersState, valor: string | number | undefined) => {
      const params = new URLSearchParams(searchParams.toString());
      if (valor === undefined || valor === '') params.delete(chave);
      else params.set(chave, String(valor));
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const limparFiltros = useCallback(() => {
    router.push(pathname, { scroll: false });
  }, [router, pathname]);

  const temFiltrosAtivos = Boolean(filtros.competenciaId ?? filtros.riskConfigId ?? filtros.origem);

  return { filtros, setFiltro, limparFiltros, temFiltrosAtivos };
}
