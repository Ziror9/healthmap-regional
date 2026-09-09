'use client';

import type { ClassificacaoRisco } from '@healthmap/contracts';
import { Minus, Plus, Maximize2 } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { getClassificacaoDisplay } from '@/lib/risk-display';
import { projetarMalha, type GeoJsonCollection, type MunicipioGeometria } from '@/lib/geo-projection';
import { useMapViewport } from '@/lib/use-map-viewport';
import { cn } from '@/lib/utils';

/**
 * Mapa coropletico de Sao Paulo em SVG puro - sem Leaflet/react-leaflet.
 *
 * Le o GeoJSON estatico real do IBGE (public/geo/sp-municipios.geojson, ver
 * public/geo/README.md) e projeta com lib/geo-projection.ts. A projecao mora
 * fora deste arquivo de proposito: e a mesma geometria que o mapa de fluxo da
 * Fase 5.11 vai usar para ancorar arcos, e duplica-la garantiria divergencia
 * entre o poligono desenhado e a ponta do arco.
 *
 * E2 do redesign, alteracoes:
 *  - proporcao geografica corrigida (A1) - ver o cabecalho de geo-projection.ts;
 *  - zoom/pan pelo viewBox, sem tocar nos 645 caminhos;
 *  - hover, selecao e foco de teclado como camadas separadas, para que
 *    interagir com o mapa nao reconcilie a malha inteira;
 *  - navegacao por teclado espacial (setas) com anuncio em aria-live;
 *  - tooltip proprio, preso as bordas do container (o <title> nativo saia da
 *    viewport e era invisivel ao teclado).
 */

export interface MunicipioNoMapa {
  id: number;
  codigoIbge7: string;
  nome: string;
  classificacao: ClassificacaoRisco | null;
  indice: number | null;
}

/** Trava de leitura: nenhuma interacao do mapa reprojeta a malha. */
const CLASSE_INDISPONIVEL = 'fill-unavailable-bg';

/**
 * Camada dos 645 poligonos. Memoizada com comparacao elemento a elemento das
 * cores: hover, foco, selecao, zoom e pan NAO passam por aqui - so uma
 * mudanca real de cor (troca de indicador, de ano ou de competencia)
 * reconcilia a malha.
 */
const CamadaMunicipios = memo(
  function CamadaMunicipios({ geometrias, classes }: { geometrias: MunicipioGeometria[]; classes: string[] }) {
    return (
      <g>
        {geometrias.map((geo, indice) => (
          <path
            key={geo.codigoIbge7}
            d={geo.d}
            data-codigo={geo.codigoIbge7}
            className={cn('stroke-surface', classes[indice])}
            strokeWidth={0.6}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
    );
  },
  (anterior, proximo) =>
    anterior.geometrias === proximo.geometrias &&
    anterior.classes.length === proximo.classes.length &&
    anterior.classes.every((classe, i) => classe === proximo.classes[i]),
);

export function MapaSP({
  municipios,
  buildHref,
  corPorCodigo,
  tooltipPorCodigo,
  onClickMunicipio,
  selecionadoId = null,
  legenda,
  overlay,
}: {
  municipios: MunicipioNoMapa[];
  /** Constroi o href do detalhe do municipio preservando os filtros. Ignorado se onClickMunicipio for informado. */
  buildHref?: (municipioId: number) => string;
  /** Sobrescreve a cor por classificacao de risco (default) por uma escala generica - ver lib/radar-municipal-color.ts. */
  corPorCodigo?: (codigoIbge7: string) => string;
  /** Sobrescreve o texto do tooltip - default: nome + classificacao de risco. */
  tooltipPorCodigo?: (codigoIbge7: string, municipio: MunicipioNoMapa) => string;
  /** Sobrescreve o clique (default: navega para /municipios/:id). */
  onClickMunicipio?: (municipio: MunicipioNoMapa) => void;
  /** Municipio com estado de SELECAO (contorno permanente) - distinto de hover e de foco. */
  selecionadoId?: number | null;
  /** Legenda da escala, exibida no rodape do quadro do mapa. */
  legenda?: ReactNode;
  /**
   * Camada desenhada SOBRE os municipios, no mesmo sistema de coordenadas
   * (unidades da caixa de desenho). E a costura prevista para o mapa de fluxo
   * da Fase 5.11: os arcos usarao os centroides de lib/geo-projection.ts, sem
   * segunda implementacao de projecao. Nao ha consumidor ainda.
   */
  overlay?: ReactNode;
}) {
  const router = useRouter();
  const [geo, setGeo] = useState<GeoJsonCollection | null>(null);
  const [erro, setErro] = useState(false);
  const [hoverCodigo, setHoverCodigo] = useState<string | null>(null);
  const [focoCodigo, setFocoCodigo] = useState<string | null>(null);
  const [ponteiroTela, setPonteiroTela] = useState<{ x: number; y: number } | null>(null);
  const refContainer = useRef<HTMLDivElement | null>(null);
  const arrastouRef = useRef(false);

  useEffect(() => {
    let cancelado = false;
    fetch('/geo/sp-municipios.geojson')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((dados: GeoJsonCollection) => {
        if (!cancelado) setGeo(dados);
      })
      .catch(() => {
        if (!cancelado) setErro(true);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const malha = useMemo(() => (geo ? projetarMalha(geo) : null), [geo]);
  const viewport = useMapViewport(malha?.caixa ?? null);

  const municipioPorCodigo = useMemo(() => {
    const mapa = new Map<string, MunicipioNoMapa>();
    for (const m of municipios) mapa.set(m.codigoIbge7, m);
    return mapa;
  }, [municipios]);

  const geometriaPorCodigo = useMemo(() => {
    const mapa = new Map<string, MunicipioGeometria>();
    for (const g of malha?.municipios ?? []) mapa.set(g.codigoIbge7, g);
    return mapa;
  }, [malha]);

  const classes = useMemo(
    () =>
      (malha?.municipios ?? []).map((g) => {
        if (corPorCodigo) return corPorCodigo(g.codigoIbge7);
        const municipio = municipioPorCodigo.get(g.codigoIbge7);
        return municipio?.classificacao
          ? getClassificacaoDisplay(municipio.classificacao).mapFillClass
          : CLASSE_INDISPONIVEL;
      }),
    [malha, corPorCodigo, municipioPorCodigo],
  );

  const textoDe = useCallback(
    (codigo: string): string => {
      const municipio = municipioPorCodigo.get(codigo);
      if (!municipio) return codigo;
      if (tooltipPorCodigo) return tooltipPorCodigo(codigo, municipio);
      const display = municipio.classificacao ? getClassificacaoDisplay(municipio.classificacao) : null;
      return `${municipio.nome}${display ? ` — ${display.label} (nível ${display.nivel}/5)` : ' — sem índice calculado'}`;
    },
    [municipioPorCodigo, tooltipPorCodigo],
  );

  const acionar = useCallback(
    (codigo: string) => {
      const municipio = municipioPorCodigo.get(codigo);
      if (!municipio) return;
      if (onClickMunicipio) {
        onClickMunicipio(municipio);
        return;
      }
      router.push(buildHref ? buildHref(municipio.id) : `/municipios/${municipio.id}`);
    },
    [municipioPorCodigo, onClickMunicipio, buildHref, router],
  );

  /**
   * Um unico ouvinte para os 645 poligonos, em vez de tres por poligono
   * (1.935 closures recriadas a cada renderizacao). O alvo do evento carrega
   * `data-codigo`.
   */
  const codigoDoEvento = (alvo: EventTarget | null): string | null =>
    alvo instanceof SVGElement ? (alvo.dataset.codigo ?? null) : null;

  const aoMoverPonteiro = (evento: React.PointerEvent<SVGSVGElement>) => {
    viewport.manipuladores.onPointerMove(evento);
    if (viewport.arrastando) {
      arrastouRef.current = true;
      setHoverCodigo(null);
      return;
    }
    setHoverCodigo(codigoDoEvento(evento.target));
    const rect = refContainer.current?.getBoundingClientRect();
    if (rect) setPonteiroTela({ x: evento.clientX - rect.left, y: evento.clientY - rect.top });
  };

  const aoClicar = (evento: React.MouseEvent<SVGSVGElement>) => {
    // Arrastar o mapa nao deve navegar para o municipio sob o cursor.
    if (arrastouRef.current) {
      arrastouRef.current = false;
      return;
    }
    const codigo = codigoDoEvento(evento.target);
    if (codigo) {
      setFocoCodigo(codigo);
      acionar(codigo);
    }
  };

  /**
   * Navegacao por teclado ESPACIAL: a seta leva ao municipio mais proximo
   * naquela direcao, usando os centroides. Uma ordem alfabetica faria o foco
   * saltar pelo estado a cada tecla - num mapa, a direcao E a informacao.
   *
   * O mapa e UM ponto de tabulacao, nao 645: tabular por 645 municipios para
   * atravessar a pagina seria pior do que nao ter acesso por teclado.
   */
  const moverFoco = useCallback(
    (dx: number, dy: number) => {
      const geometrias = malha?.municipios ?? [];
      if (geometrias.length === 0) return;
      const atual = focoCodigo ? geometriaPorCodigo.get(focoCodigo) : undefined;
      if (!atual) {
        setFocoCodigo(geometrias[0]!.codigoIbge7);
        return;
      }
      const [ax, ay] = atual.centroide;
      let melhor: { codigo: string; distancia: number } | null = null;
      for (const geo of geometrias) {
        if (geo.codigoIbge7 === atual.codigoIbge7) continue;
        const vx = geo.centroide[0] - ax;
        const vy = geo.centroide[1] - ay;
        // So candidatos cuja direcao dominante e a da seta.
        if (dx !== 0 && (Math.sign(vx) !== dx || Math.abs(vx) < Math.abs(vy))) continue;
        if (dy !== 0 && (Math.sign(vy) !== dy || Math.abs(vy) < Math.abs(vx))) continue;
        const distancia = Math.hypot(vx, vy);
        if (!melhor || distancia < melhor.distancia) melhor = { codigo: geo.codigoIbge7, distancia };
      }
      if (melhor) setFocoCodigo(melhor.codigo);
    },
    [malha, focoCodigo, geometriaPorCodigo],
  );

  const aoTeclar = (evento: React.KeyboardEvent<SVGSVGElement>) => {
    const teclas: Record<string, [number, number]> = {
      ArrowRight: [1, 0],
      ArrowLeft: [-1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const direcao = teclas[evento.key];
    if (direcao) {
      evento.preventDefault();
      moverFoco(direcao[0], direcao[1]);
      return;
    }
    if (evento.key === 'Enter' || evento.key === ' ') {
      if (focoCodigo) {
        evento.preventDefault();
        acionar(focoCodigo);
      }
      return;
    }
    if (evento.key === '+' || evento.key === '=') {
      evento.preventDefault();
      viewport.ampliar();
    } else if (evento.key === '-') {
      evento.preventDefault();
      viewport.reduzir();
    } else if (evento.key === '0') {
      evento.preventDefault();
      viewport.resetar();
    }
  };

  if (erro) {
    return (
      <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-border bg-surface-muted text-body text-muted-foreground">
        Não foi possível carregar o mapa.
      </div>
    );
  }

  if (!malha) {
    return (
      <div className="aspect-[3/2] w-full animate-pulse rounded-md border border-border bg-surface-muted" aria-label="Carregando mapa" role="status" />
    );
  }

  const selecionado = municipios.find((m) => m.id === selecionadoId) ?? null;
  const geoSelecionada = selecionado ? geometriaPorCodigo.get(selecionado.codigoIbge7) : undefined;
  const geoFoco = focoCodigo ? geometriaPorCodigo.get(focoCodigo) : undefined;
  const geoHover = hoverCodigo ? geometriaPorCodigo.get(hoverCodigo) : undefined;
  const textoTooltip = hoverCodigo ? textoDe(hoverCodigo) : null;

  return (
    <div ref={refContainer} className="relative overflow-hidden rounded-md border border-border bg-surface">
      <svg
        ref={viewport.refSvg}
        viewBox={viewport.viewBox}
        style={{ aspectRatio: String(malha.caixa.proporcao), touchAction: 'none' }}
        className={cn('w-full select-none', viewport.arrastando ? 'cursor-grabbing' : 'cursor-grab')}
        role="group"
        tabIndex={0}
        aria-label="Mapa dos municípios de São Paulo. Use as setas para percorrer municípios, Enter para abrir, mais e menos para ampliar."
        onPointerDown={viewport.manipuladores.onPointerDown}
        onPointerMove={aoMoverPonteiro}
        onPointerUp={viewport.manipuladores.onPointerUp}
        onPointerCancel={viewport.manipuladores.onPointerCancel}
        onPointerLeave={() => {
          setHoverCodigo(null);
          setPonteiroTela(null);
        }}
        onClick={aoClicar}
        onKeyDown={aoTeclar}
      >
        <CamadaMunicipios geometrias={malha.municipios} classes={classes} />

        {/* Camadas de estado, separadas da malha: hover, selecao e foco nao
            reconciliam os 645 caminhos. Tres tratamentos distintos, como pede
            a especificacao - hover e passageiro, selecao e permanente, foco e
            de teclado. */}
        <g className="pointer-events-none">
          {geoHover && (
            <path d={geoHover.d} className="fill-none stroke-foreground/60" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          )}
          {geoSelecionada && (
            <path d={geoSelecionada.d} className="fill-none stroke-primary" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
          )}
          {geoFoco && (
            <path
              d={geoFoco.d}
              className="fill-none stroke-foreground"
              strokeWidth={2}
              strokeDasharray="4 2"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {overlay}
        </g>
      </svg>

      {/* Anuncio do municipio em foco - o equivalente falado do contorno. */}
      <p aria-live="polite" className="sr-only">
        {focoCodigo ? textoDe(focoCodigo) : ''}
      </p>

      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <BotaoMapa rotulo="Ampliar" onClick={viewport.ampliar} desabilitado={!viewport.podeAmpliar}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
        </BotaoMapa>
        <BotaoMapa rotulo="Reduzir" onClick={viewport.reduzir} desabilitado={!viewport.podeReduzir}>
          <Minus className="h-3.5 w-3.5" aria-hidden />
        </BotaoMapa>
        <BotaoMapa rotulo="Enquadrar o estado inteiro" onClick={viewport.resetar} desabilitado={!viewport.podeReduzir}>
          <Maximize2 className="h-3.5 w-3.5" aria-hidden />
        </BotaoMapa>
      </div>

      {textoTooltip && ponteiroTela && (
        <Tooltip texto={textoTooltip} ponto={ponteiroTela} container={refContainer.current} />
      )}

      {legenda && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border bg-surface px-3 py-2">
          {legenda}
        </div>
      )}
    </div>
  );
}

function BotaoMapa({
  rotulo,
  onClick,
  desabilitado,
  children,
}: {
  rotulo: string;
  onClick: () => void;
  desabilitado?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      aria-label={rotulo}
      title={rotulo}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface/90 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-surface-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-surface/90"
    >
      {children}
    </button>
  );
}

/**
 * Tooltip preso as bordas do container. O <title> nativo do SVG, usado antes,
 * nao respeitava a viewport, nao aparecia no teclado e tinha o atraso do
 * navegador.
 */
function Tooltip({
  texto,
  ponto,
  container,
}: {
  texto: string;
  ponto: { x: number; y: number };
  container: HTMLDivElement | null;
}) {
  const largura = container?.clientWidth ?? 0;
  const altura = container?.clientHeight ?? 0;
  const LARGURA_ESTIMADA = 190;
  const acimaDoCursor = ponto.y > 60;
  const esquerda = Math.min(Math.max(8, ponto.x - LARGURA_ESTIMADA / 2), Math.max(8, largura - LARGURA_ESTIMADA - 8));
  const topo = acimaDoCursor ? ponto.y - 12 : Math.min(ponto.y + 18, Math.max(0, altura - 40));

  return (
    <div
      role="presentation"
      style={{ left: esquerda, top: topo, maxWidth: LARGURA_ESTIMADA, transform: acimaDoCursor ? 'translateY(-100%)' : undefined }}
      className="pointer-events-none absolute z-10 whitespace-pre-line rounded-md bg-foreground px-2.5 py-1.5 text-caption leading-snug text-background shadow-md"
    >
      {texto}
    </div>
  );
}
