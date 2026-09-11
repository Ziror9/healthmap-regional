'use client';

import { memo } from 'react';
import { caminhoDoArco, larguraDoArco, type ArcoFluxo } from '@/lib/fluxo-arcos';
import { formatNumero } from '@/lib/format';
import type { Ponto } from '@/lib/geo-projection';
import { cn } from '@/lib/utils';

/**
 * Camadas do mapa de fluxo (Fase 5.11), desenhadas sobre o MapaSP pelo
 * `overlay` - no MESMO sistema de coordenadas e com os MESMOS centroides da
 * malha (lib/geo-projection.ts). Nenhuma segunda projecao existe.
 *
 * Os componentes recebem arcos prontos e nao sabem de onde vieram: hoje, de
 * um municipio por vez (`/api/fluxo/municipios/:id`); numa futura visao
 * estadual, de um endpoint com todos os pares. A camada nao muda.
 *
 * Codificacao visual:
 *  - ESPESSURA = volume de internacoes (unico canal de magnitude);
 *  - grafite, nao cor da rampa de risco: fluxo nao e risco, e pintar arcos com
 *    a rampa faria o leitor ler "gravidade" onde ha "deslocamento";
 *  - vermelho institucional so no municipio selecionado (identidade/selecao);
 *  - sem seta: a curvatura consistente (sempre a esquerda do sentido) e o
 *    ponto na contraparte ja dao a direcao, e setas com traco que nao escala
 *    se deformam no zoom.
 */

interface BaseCamada {
  centroideDe: (codigoIbge7: string) => Ponto | undefined;
  /** Unidades do SVG por pixel de tela - para rotulo e ponto terem tamanho fixo em qualquer zoom. */
  unidadesPorPixel: number;
}

/** Disco de diametro FIXO na tela: segmento de comprimento zero, ponta redonda, traco que nao escala. */
function Ponto({ ponto, diametroPx, className }: { ponto: Ponto; diametroPx: number; className?: string }) {
  return (
    <path
      d={`M ${ponto[0].toFixed(1)} ${ponto[1].toFixed(1)} l 0 0`}
      strokeLinecap="round"
      strokeWidth={diametroPx}
      vectorEffect="non-scaling-stroke"
      className={className}
    />
  );
}

function Rotulo({ ponto, texto, unidadesPorPixel }: { ponto: Ponto; texto: string; unidadesPorPixel: number }) {
  const u = unidadesPorPixel;
  return (
    <text
      x={ponto[0] + 7 * u}
      y={ponto[1] - 7 * u}
      fontSize={11.5 * u}
      className="fill-foreground font-sans font-semibold"
      style={{ paintOrder: 'stroke', stroke: 'hsl(var(--surface))', strokeWidth: 3 * u, strokeLinejoin: 'round' }}
    >
      {texto}
    </text>
  );
}

export const CamadaFluxo = memo(function CamadaFluxo({
  arcos,
  centroideDe,
  unidadesPorPixel,
  selecionado,
  destacadoId,
  rotulos = 3,
}: BaseCamada & {
  arcos: ArcoFluxo[];
  /** codigoIbge7 do municipio selecionado. */
  selecionado: string;
  /** Contraparte em destaque (hover no ranking): as outras recuam. */
  destacadoId: number | null;
  rotulos?: number;
}) {
  const maximo = arcos.reduce((m, a) => Math.max(m, a.valor), 0);
  // Do menor para o maior: o arco dominante e desenhado por ultimo, por cima.
  const doMenorParaOMaior = [...arcos].sort((a, b) => a.valor - b.valor);
  const comRotulo = new Set(
    [...arcos]
      .sort((a, b) => b.valor - a.valor)
      .slice(0, rotulos)
      .map((a) => a.municipioId),
  );
  if (destacadoId !== null) comRotulo.add(destacadoId);
  const pontoSelecionado = centroideDe(selecionado);

  return (
    <g aria-hidden>
      {doMenorParaOMaior.map((arco) => {
        const a = centroideDe(arco.origem);
        const b = centroideDe(arco.destino);
        const d = a && b ? caminhoDoArco(a, b) : null;
        if (!d) return null;
        const destacado = destacadoId === arco.municipioId;
        const recua = destacadoId !== null && !destacado;
        return (
          <path
            key={`arco-${arco.municipioId}`}
            d={d}
            fill="none"
            strokeLinecap="round"
            strokeWidth={larguraDoArco(arco.valor, maximo) + (destacado ? 1.5 : 0)}
            vectorEffect="non-scaling-stroke"
            className={cn('stroke-foreground transition-opacity', recua ? 'opacity-20' : destacado ? 'opacity-100' : 'opacity-60')}
          />
        );
      })}

      {doMenorParaOMaior.map((arco) => {
        const p = centroideDe(arco.contraparte);
        if (!p) return null;
        const recua = destacadoId !== null && destacadoId !== arco.municipioId;
        return (
          <Ponto
            key={`ponto-${arco.municipioId}`}
            ponto={p}
            diametroPx={5}
            className={cn('stroke-foreground', recua ? 'opacity-30' : 'opacity-90')}
          />
        );
      })}

      {pontoSelecionado && <Ponto ponto={pontoSelecionado} diametroPx={10} className="stroke-primary" />}

      {arcos
        .filter((arco) => comRotulo.has(arco.municipioId))
        .map((arco) => {
          const p = centroideDe(arco.contraparte);
          return p ? (
            <Rotulo
              key={`rotulo-${arco.municipioId}`}
              ponto={p}
              texto={`${arco.rotulo} · ${formatNumero(arco.valor)}`}
              unidadesPorPixel={unidadesPorPixel}
            />
          ) : null;
        })}
    </g>
  );
});

/**
 * Visao de entrada (nenhum municipio selecionado): os polos que mais recebem
 * pacientes de fora, como discos de area proporcional ao volume. Responde
 * "onde o estado concentra o tratamento" antes de qualquer clique.
 */
export const CamadaPolos = memo(function CamadaPolos({
  polos,
  centroideDe,
  unidadesPorPixel,
  rotulos = 5,
}: BaseCamada & {
  polos: { codigoIbge7: string; nome: string; valor: number }[];
  rotulos?: number;
}) {
  const maximo = polos.reduce((m, p) => Math.max(m, p.valor), 0);
  const doMaiorParaOMenor = [...polos].sort((a, b) => b.valor - a.valor);

  return (
    <g aria-hidden>
      {/* Maiores primeiro: os menores ficam por cima e continuam clicaveis a vista. */}
      {doMaiorParaOMenor.map((polo) => {
        const p = centroideDe(polo.codigoIbge7);
        if (!p) return null;
        const diametro = 6 + 22 * Math.sqrt(maximo > 0 ? polo.valor / maximo : 0);
        return <Ponto key={polo.codigoIbge7} ponto={p} diametroPx={diametro} className="stroke-foreground opacity-50" />;
      })}
      {doMaiorParaOMenor.slice(0, rotulos).map((polo) => {
        const p = centroideDe(polo.codigoIbge7);
        return p ? (
          <Rotulo
            key={`rotulo-${polo.codigoIbge7}`}
            ponto={p}
            texto={`${polo.nome} · ${formatNumero(polo.valor)}`}
            unidadesPorPixel={unidadesPorPixel}
          />
        ) : null;
      })}
    </g>
  );
});
