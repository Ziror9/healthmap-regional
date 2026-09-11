'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { TOP_PADRAO, interpretarFiltrosFluxo, type FiltrosFluxo, type ModoFluxo, type TopN } from './fluxo-arcos';

/**
 * Estado da pagina de Fluxo Assistencial na URL - municipio, modo, Top N e
 * ano. Mesmo padrao de `useRadarMunicipalFiltros` (E4): a analise e
 * compartilhavel e sobrevive a refresh, e a interpretacao da URL (com os
 * fallbacks para valor invalido) vive em `interpretarFiltrosFluxo`, que e
 * testada.
 *
 * Valores iguais ao padrao saem da URL (`modo=origem`, `top=10`), para que o
 * link de um municipio seja curto e canonico.
 */
export function useFluxoFiltros() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filtros = useMemo<FiltrosFluxo>(() => interpretarFiltrosFluxo(searchParams), [searchParams]);

  const aplicar = useCallback(
    (mudancas: Partial<Record<'municipio' | 'modo' | 'top' | 'ano', string | number | undefined>>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [chave, valor] of Object.entries(mudancas)) {
        if (valor === undefined || valor === '') params.delete(chave);
        else params.set(chave, String(valor));
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const modoNaUrl = (modo: ModoFluxo) => (modo === 'origem' ? undefined : modo);

  return {
    filtros,
    selecionar: useCallback(
      (municipioId: number, modo: ModoFluxo) => aplicar({ municipio: municipioId, modo: modoNaUrl(modo) }),
      [aplicar],
    ),
    limparSelecao: useCallback(() => aplicar({ municipio: undefined, modo: undefined }), [aplicar]),
    setModo: useCallback((modo: ModoFluxo) => aplicar({ modo: modoNaUrl(modo) }), [aplicar]),
    setTop: useCallback((top: TopN) => aplicar({ top: top === TOP_PADRAO ? undefined : top }), [aplicar]),
    setAno: useCallback((ano: number | undefined) => aplicar({ ano }), [aplicar]),
    quantidadeAtiva: (filtros.top !== TOP_PADRAO ? 1 : 0) + (filtros.ano !== undefined ? 1 : 0),
  };
}
