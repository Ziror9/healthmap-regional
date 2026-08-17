'use client';

import type { ClassificacaoRisco } from '@healthmap/contracts';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getClassificacaoDisplay } from '@/lib/risk-display';
import { cn } from '@/lib/utils';

/**
 * Mapa coropletico de Sao Paulo em SVG puro - sem Leaflet/react-leaflet.
 * Le o GeoJSON estatico real do IBGE (public/geo/sp-municipios.geojson,
 * ver public/geo/README.md para a fonte) e projeta lon/lat para SVG com uma
 * projecao equiretangular simples (correcao de cosseno na longitude para
 * nao distorcer a proporcao) - suficiente para um mapa estadual estatico,
 * sem a complexidade de uma biblioteca de tiles/pan/zoom que este produto
 * nao usa.
 */

type Ponto = [number, number];
type Anel = Ponto[];

interface GeoJsonFeature {
  properties: { codarea: string };
  geometry:
    | { type: 'Polygon'; coordinates: Anel[] }
    | { type: 'MultiPolygon'; coordinates: Anel[][] };
}

interface GeoJsonCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

export interface MunicipioNoMapa {
  id: number;
  codigoIbge7: string;
  nome: string;
  classificacao: ClassificacaoRisco | null;
  indice: number | null;
}

const COR_PREENCHIMENTO_MAPA: Record<ClassificacaoRisco, string> = {
  CRITICO: 'fill-red-300',
  ALTO: 'fill-orange-300',
  MEDIO: 'fill-amber-300',
  BAIXO: 'fill-sky-300',
  MUITO_BAIXO: 'fill-emerald-300',
};

const LARGURA = 640;
const ALTURA = 640;

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function corrigirLongitude(lon: number, latMedia: number): number {
  // Compensa a compressao de longitude em latitudes distantes do equador -
  // sem isso o estado fica visivelmente "esticado" na horizontal.
  return lon * Math.cos((latMedia * Math.PI) / 180);
}

function calcularBounds(colecao: GeoJsonCollection, latMedia: number): Bounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const visitarAnel = (anel: Anel) => {
    for (const [lon, lat] of anel) {
      const x = corrigirLongitude(lon, latMedia);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (lat < minY) minY = lat;
      if (lat > maxY) maxY = lat;
    }
  };

  for (const feature of colecao.features) {
    if (feature.geometry.type === 'Polygon') {
      for (const anel of feature.geometry.coordinates) visitarAnel(anel);
    } else {
      for (const poligono of feature.geometry.coordinates) {
        for (const anel of poligono) visitarAnel(anel);
      }
    }
  }

  return { minX, maxX, minY, maxY };
}

function projetar(lon: number, lat: number, latMedia: number, bounds: Bounds): Ponto {
  const x = corrigirLongitude(lon, latMedia);
  const px = ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * LARGURA;
  const py = ALTURA - ((lat - bounds.minY) / (bounds.maxY - bounds.minY)) * ALTURA;
  return [px, py];
}

function anelParaPath(anel: Anel, latMedia: number, bounds: Bounds): string {
  return (
    anel
      .map(([lon, lat], indice) => {
        const [x, y] = projetar(lon, lat, latMedia, bounds);
        return `${indice === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ') + ' Z'
  );
}

function geometriaParaPath(geometry: GeoJsonFeature['geometry'], latMedia: number, bounds: Bounds): string {
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.map((anel) => anelParaPath(anel, latMedia, bounds)).join(' ');
  }
  return geometry.coordinates.flatMap((poligono) => poligono.map((anel) => anelParaPath(anel, latMedia, bounds))).join(' ');
}

export function MapaSP({ municipios }: { municipios: MunicipioNoMapa[] }) {
  const router = useRouter();
  const [geo, setGeo] = useState<GeoJsonCollection | null>(null);
  const [erro, setErro] = useState(false);
  const [hoverCodigo, setHoverCodigo] = useState<string | null>(null);

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

  const municipioPorCodigo = useMemo(() => {
    const mapa = new Map<string, MunicipioNoMapa>();
    for (const m of municipios) mapa.set(m.codigoIbge7, m);
    return mapa;
  }, [municipios]);

  const { paths } = useMemo(() => {
    if (!geo) return { paths: [] as { codigo: string; d: string }[] };
    let somaLat = 0;
    let contagem = 0;
    for (const feature of geo.features) {
      const anel: Anel | undefined =
        feature.geometry.type === 'Polygon' ? feature.geometry.coordinates[0] : feature.geometry.coordinates[0]?.[0];
      for (const [, lat] of anel ?? []) {
        somaLat += lat;
        contagem += 1;
      }
    }
    const media = contagem > 0 ? somaLat / contagem : -22;
    const bounds = calcularBounds(geo, media);
    const lista = geo.features.map((feature) => ({
      codigo: feature.properties.codarea,
      d: geometriaParaPath(feature.geometry, media, bounds),
    }));
    return { paths: lista };
  }, [geo]);

  if (erro) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border bg-surface-muted text-sm text-muted-foreground">
        Não foi possível carregar o mapa.
      </div>
    );
  }

  if (!geo) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-border bg-surface-muted text-sm text-muted-foreground">
        Carregando mapa...
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} className="w-full" role="img" aria-label="Mapa dos municípios de São Paulo por nível de risco">
        {paths.map(({ codigo, d }) => {
          const municipio = municipioPorCodigo.get(codigo);
          const display = municipio?.classificacao ? getClassificacaoDisplay(municipio.classificacao) : null;
          const emHover = hoverCodigo === codigo;
          return (
            <path
              key={codigo}
              d={d}
              className={cn(
                'cursor-pointer stroke-surface transition-opacity',
                municipio?.classificacao ? COR_PREENCHIMENTO_MAPA[municipio.classificacao] : 'fill-muted',
                emHover && 'opacity-80',
              )}
              strokeWidth={0.5}
              onMouseEnter={() => setHoverCodigo(codigo)}
              onMouseLeave={() => setHoverCodigo((atual) => (atual === codigo ? null : atual))}
              onClick={() => {
                if (municipio) router.push(`/municipios/${municipio.id}`);
              }}
            >
              <title>
                {municipio
                  ? `${municipio.nome}${display ? ` — ${display.label} (nível ${display.nivel}/5)` : ' — sem índice REAL calculado'}`
                  : codigo}
              </title>
            </path>
          );
        })}
      </svg>
    </div>
  );
}
