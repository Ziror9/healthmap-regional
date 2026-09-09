/**
 * Projecao e geometria do mapa de Sao Paulo.
 *
 * Modulo PURO (sem React, sem DOM): recebe GeoJSON, devolve caminhos SVG,
 * centroides e a caixa de desenho. Extraido de components/charts/map.tsx na
 * E2 do redesign por dois motivos: a correcao de proporcao (A1) e uma questao
 * matematica que merece ficar isolada e legivel, e o mapa de fluxo da Fase
 * 5.11 vai precisar EXATAMENTE da mesma projecao e dos mesmos centroides para
 * ancorar arcos - reimplementar geometria em outro arquivo garantiria
 * divergencia entre o poligono desenhado e a ponta do arco.
 *
 * ---------------------------------------------------------------------------
 * PROJECAO (equirretangular (plate carree) com paralelo padrao)
 * ---------------------------------------------------------------------------
 * Para um recorte pequeno como um estado, a projecao equirretangular com
 * paralelo padrao phi0 e suficiente e nao exige dependencia nenhuma:
 *
 *     x' = lambda * cos(phi0)      (longitude comprimida pelo cosseno)
 *     y' = phi
 *
 * phi0 e a latitude media da malha. Sem o cos(phi0) o estado apareceria
 * esticado na horizontal, porque um grau de longitude a 22S mede ~93% de um
 * grau de latitude.
 *
 * ---------------------------------------------------------------------------
 * O DEFEITO CORRIGIDO NA E2 (A1)
 * ---------------------------------------------------------------------------
 * A versao anterior aplicava corretamente o cos(phi0) e, logo depois, jogava o
 * resultado numa caixa QUADRADA usando uma escala independente por eixo:
 *
 *     sx = LARGURA / larguraGeo        sy = ALTURA / alturaGeo
 *
 * Com LARGURA = ALTURA = 640 e larguraGeo/alturaGeo = 1,498, isso da
 *
 *     sy / sx = 1,498
 *
 * ou seja, o estado era desenhado 49,8% mais alto do que e - e a correcao de
 * longitude, aplicada uma linha antes, era integralmente anulada. Medido no
 * DOM antes da correcao: bbox desenhado 640x640 (razao 1,000) para uma
 * geometria de razao 1,498.
 *
 * Correcao: UMA escala para os dois eixos,
 *
 *     s = LARGURA / larguraGeo
 *     px = (x' - x'min) * s
 *     py = (y'max - phi) * s          (eixo Y invertido: SVG cresce para baixo)
 *
 * e a altura da caixa passa a ser DERIVADA da geometria (ALTURA =
 * alturaGeo * s), em vez de imposta. Assim nao ha nem distorcao nem
 * letterbox: a razao do viewBox e a razao real do territorio, e o SVG escala
 * dentro do container preservando-a (preserveAspectRatio padrao).
 *
 * O cos(phi0) NAO foi removido - continua sendo o que da a proporcao correta.
 * O que mudou foi parar de destrui-lo no passo seguinte.
 */

export type Ponto = [number, number];
export type Anel = Ponto[];

export interface GeoJsonFeature {
  properties: { codarea: string };
  geometry: { type: 'Polygon'; coordinates: Anel[] } | { type: 'MultiPolygon'; coordinates: Anel[][] };
}

export interface GeoJsonCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

/** Largura de referencia do sistema de coordenadas interno do SVG (unidades de usuario). */
export const LARGURA_VIEWBOX = 1000;

export interface CaixaDesenho {
  largura: number;
  /** Derivada da geometria - nunca imposta. */
  altura: number;
  /** Razao largura/altura efetivamente desenhada. Deve bater com a do territorio. */
  proporcao: number;
}

export interface MunicipioGeometria {
  codigoIbge7: string;
  /** Caminho SVG ja projetado, em unidades da caixa de desenho. */
  d: string;
  /** Centroide de area do maior anel, na mesma escala do caminho. Ancora de rotulo, foco e (Fase 5.11) arco de fluxo. */
  centroide: Ponto;
}

export interface MalhaProjetada {
  caixa: CaixaDesenho;
  municipios: MunicipioGeometria[];
}

function todosOsAneis(feature: GeoJsonFeature): Anel[] {
  return feature.geometry.type === 'Polygon' ? feature.geometry.coordinates : feature.geometry.coordinates.flat();
}

/** Latitude media da malha (phi0), ponderada por vertice - o paralelo padrao da projecao. */
function calcularLatitudeMedia(colecao: GeoJsonCollection): number {
  let soma = 0;
  let total = 0;
  for (const feature of colecao.features) {
    for (const anel of todosOsAneis(feature)) {
      for (const [, lat] of anel) {
        soma += lat;
        total += 1;
      }
    }
  }
  return total > 0 ? soma / total : -22;
}

/** Compressao da longitude pelo cosseno do paralelo padrao. Preservada da implementacao original. */
export function corrigirLongitude(lon: number, latMedia: number): number {
  return lon * Math.cos((latMedia * Math.PI) / 180);
}

/**
 * Centroide de AREA de um anel (formula do poligono), nao a media dos
 * vertices: a media dos vertices e enviesada para onde o contorno tem mais
 * pontos, o que num municipio de litoral recortado cai fora do corpo da
 * figura. Cai para a media dos vertices apenas em anel degenerado (area 0).
 */
function centroideDoAnel(anel: readonly Ponto[]): Ponto {
  let areaDuplicada = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < anel.length; i += 1) {
    const [x0, y0] = anel[i]!;
    const [x1, y1] = anel[(i + 1) % anel.length]!;
    const cruzado = x0 * y1 - x1 * y0;
    areaDuplicada += cruzado;
    cx += (x0 + x1) * cruzado;
    cy += (y0 + y1) * cruzado;
  }
  if (areaDuplicada === 0) {
    const soma = anel.reduce<Ponto>((acc, [x, y]) => [acc[0] + x, acc[1] + y], [0, 0]);
    return [soma[0] / anel.length, soma[1] / anel.length];
  }
  const fator = 1 / (3 * areaDuplicada);
  return [cx * fator, cy * fator];
}

function areaAbsolutaDoAnel(anel: readonly Ponto[]): number {
  let areaDuplicada = 0;
  for (let i = 0; i < anel.length; i += 1) {
    const [x0, y0] = anel[i]!;
    const [x1, y1] = anel[(i + 1) % anel.length]!;
    areaDuplicada += x0 * y1 - x1 * y0;
  }
  return Math.abs(areaDuplicada) / 2;
}

/**
 * Projeta a malha inteira uma unica vez.
 *
 * O resultado e estavel enquanto o GeoJSON nao muda - zoom e pan NAO
 * reprojetam nada (movem o viewBox), entao esta funcao roda uma vez por carga
 * de pagina, para os 645 municipios.
 */
export function projetarMalha(colecao: GeoJsonCollection): MalhaProjetada {
  const latMedia = calcularLatitudeMedia(colecao);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const feature of colecao.features) {
    for (const anel of todosOsAneis(feature)) {
      for (const [lon, lat] of anel) {
        const x = corrigirLongitude(lon, latMedia);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (lat < minY) minY = lat;
        if (lat > maxY) maxY = lat;
      }
    }
  }

  const larguraGeo = maxX - minX;
  const alturaGeo = maxY - minY;
  // UMA escala para os dois eixos - e o ponto central da correcao A1.
  const escala = LARGURA_VIEWBOX / larguraGeo;
  const caixa: CaixaDesenho = {
    largura: LARGURA_VIEWBOX,
    altura: alturaGeo * escala,
    proporcao: larguraGeo / alturaGeo,
  };

  const projetar = (lon: number, lat: number): Ponto => [
    (corrigirLongitude(lon, latMedia) - minX) * escala,
    (maxY - lat) * escala,
  ];

  const municipios = colecao.features.map((feature) => {
    const aneis = todosOsAneis(feature);
    const aneisProjetados = aneis.map((anel) => anel.map(([lon, lat]) => projetar(lon, lat)));

    const d = aneisProjetados
      .map(
        (anel) =>
          anel
            .map(([x, y], indice) => `${indice === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
            .join(' ') + ' Z',
      )
      .join(' ');

    // Municipio com ilhas/enclaves: o centroide sai do MAIOR anel, que e o
    // corpo principal - a media entre corpo e ilha cairia na agua.
    const maior = aneisProjetados.reduce((a, b) => (areaAbsolutaDoAnel(a) >= areaAbsolutaDoAnel(b) ? a : b));

    return { codigoIbge7: feature.properties.codarea, d, centroide: centroideDoAnel(maior) };
  });

  return { caixa, municipios };
}
