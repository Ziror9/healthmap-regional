'use client';

import { radarMunicipalIndicador, type RadarMunicipalIndicador } from '@healthmap/contracts';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

/**
 * Estado do Radar Municipal na URL - indicador, ano e municipio selecionado.
 *
 * Antes da E4 nada disso sobrevivia a um refresh, e a analise nao era
 * compartilhavel: mandar "olha Barretos em mortalidade 2024" exigia descrever
 * os cliques. Mesmo padrao de `useRiskFiltersUrl`.
 *
 * REGRA: so entram parametros que correspondem a algo que a API ja aceita
 * (`indicador` e `ano` sao do proprio `GET /api/indicadores/municipios`) ou a
 * uma selecao de interface (`municipio`, que so decide qual detalhe buscar em
 * `GET /api/municipios/:id`). Nenhuma alteracao de API foi feita para
 * sustentar a URL.
 *
 * URL INVALIDA nao quebra a tela:
 *  - `indicador` desconhecido cai no padrao (INTERNACOES);
 *  - `ano`/`municipio` nao numericos sao ignorados;
 *  - `ano` numerico mas inexistente na base faz a API responder 404
 *    ANO_NAO_DISPONIVEL - quem consome trata removendo o ano da URL e
 *    recarregando (ver app/radar-municipal/page.tsx), em vez de deixar a
 *    pagina num estado de erro por causa de um link velho.
 */
const INDICADOR_PADRAO: RadarMunicipalIndicador = 'INTERNACOES';

function parseInteiroPositivo(valor: string | null): number | undefined {
  if (valor === null) return undefined;
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : undefined;
}

export interface RadarMunicipalFiltrosState {
  indicador: RadarMunicipalIndicador;
  ano?: number;
  municipioId?: number;
}

export function useRadarMunicipalFiltros() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filtros = useMemo<RadarMunicipalFiltrosState>(() => {
    const indicador = searchParams.get('indicador');
    const valido = (radarMunicipalIndicador as readonly string[]).includes(indicador ?? '');
    return {
      indicador: valido ? (indicador as RadarMunicipalIndicador) : INDICADOR_PADRAO,
      ano: parseInteiroPositivo(searchParams.get('ano')),
      municipioId: parseInteiroPositivo(searchParams.get('municipio')),
    };
  }, [searchParams]);

  const aplicar = useCallback(
    (mudancas: Partial<Record<'indicador' | 'ano' | 'municipio', string | number | undefined>>) => {
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

  return {
    filtros,
    /** Trocar de indicador zera o ano: os anos disponiveis sao por indicador. */
    setIndicador: useCallback(
      (indicador: RadarMunicipalIndicador) => aplicar({ indicador, ano: undefined }),
      [aplicar],
    ),
    setAno: useCallback((ano: number | undefined) => aplicar({ ano }), [aplicar]),
    setMunicipio: useCallback((municipioId: number | undefined) => aplicar({ municipio: municipioId }), [aplicar]),
    quantidadeAtiva:
      (filtros.indicador !== INDICADOR_PADRAO ? 1 : 0) + (filtros.ano !== undefined ? 1 : 0),
  };
}
