'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CaixaDesenho } from './geo-projection';

/**
 * Zoom e pan do mapa, implementados movendo o `viewBox` do SVG.
 *
 * POR QUE viewBox, e nao transform/scale nos caminhos: o viewBox e UM atributo
 * no elemento raiz. Alterar zoom ou posicao nao toca nenhum dos 645
 * caminhos - nao ha reprojecao, nao ha recalculo de `d`, e a arvore SVG nao e
 * reconciliada. Uma transformacao por caminho, ou reprojetar a malha a cada
 * passo de zoom, custaria 645 operacoes por quadro.
 *
 * O estado nunca pode se perder: a janela de visao e sempre mantida DENTRO da
 * extensao total da malha (ver `enquadrar`). Nao existe "navegar para o
 * infinito" nem tela em branco - no zoom minimo a janela e exatamente o
 * estado inteiro.
 */
export interface Vista {
  x: number;
  y: number;
  w: number;
  h: number;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 12;
const PASSO_BOTAO = 1.6;

export interface MapViewport {
  vista: Vista;
  viewBox: string;
  zoom: number;
  arrastando: boolean;
  podeAmpliar: boolean;
  podeReduzir: boolean;
  ampliar: () => void;
  reduzir: () => void;
  resetar: () => void;
  /** Referencia do <svg> - o hook precisa dela para converter pixel em unidade de usuario. */
  refSvg: React.RefObject<SVGSVGElement | null>;
  manipuladores: {
    onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void;
    onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void;
    onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => void;
    onPointerCancel: (e: React.PointerEvent<SVGSVGElement>) => void;
  };
}

export function useMapViewport(caixa: CaixaDesenho | null): MapViewport {
  const refSvg = useRef<SVGSVGElement | null>(null);
  const vistaCompleta = useMemo<Vista>(
    () => ({ x: 0, y: 0, w: caixa?.largura ?? 1000, h: caixa?.altura ?? 667 }),
    [caixa],
  );
  const [vista, setVista] = useState<Vista>(vistaCompleta);
  const [arrastando, setArrastando] = useState(false);

  // Ponteiros ativos: 1 = arrasto, 2 = pinca. Em ref (nao em estado) porque
  // muda a cada evento de movimento e nao deve provocar renderizacao.
  const ponteiros = useRef(new Map<number, { x: number; y: number }>());
  const distanciaPinca = useRef<number | null>(null);

  useEffect(() => setVista(vistaCompleta), [vistaCompleta]);

  /** Mantem a janela dentro da extensao total e o zoom dentro dos limites. */
  const enquadrar = useCallback(
    (proposta: Vista): Vista => {
      const largura = vistaCompleta.w;
      const altura = vistaCompleta.h;
      const w = Math.min(largura / ZOOM_MIN, Math.max(largura / ZOOM_MAX, proposta.w));
      const h = w * (altura / largura);
      return {
        w,
        h,
        x: Math.min(Math.max(0, proposta.x), Math.max(0, largura - w)),
        y: Math.min(Math.max(0, proposta.y), Math.max(0, altura - h)),
      };
    },
    [vistaCompleta],
  );

  /**
   * Zoom ancorado num ponto: o que esta sob o cursor/dedos continua sob eles.
   *
   * A atualizacao e FUNCIONAL (`setVista(anterior => ...)`), nao lida de uma
   * ref, porque um trackpad emite varios eventos de `wheel` dentro do mesmo
   * quadro: lendo o estado antes da re-renderizacao, todas as chamadas da
   * rajada partiriam da mesma vista e so a ultima valeria - o zoom avancava um
   * passo onde o usuario girou dez. Medido: 10 eventos no mesmo tick
   * resultavam em 1,15x em vez de 4,05x.
   */
  const aplicarZoom = useCallback(
    (fator: number, ancoraCliente?: { x: number; y: number }) => {
      const rect = refSvg.current?.getBoundingClientRect();
      setVista((anterior) => {
        let fracaoX = 0.5;
        let fracaoY = 0.5;
        if (rect && ancoraCliente && rect.width > 0 && rect.height > 0) {
          fracaoX = (ancoraCliente.x - rect.left) / rect.width;
          fracaoY = (ancoraCliente.y - rect.top) / rect.height;
        }
        const alvoX = anterior.x + fracaoX * anterior.w;
        const alvoY = anterior.y + fracaoY * anterior.h;
        const novaLargura = anterior.w / fator;
        const novaAltura = novaLargura * (anterior.h / anterior.w);
        return enquadrar({
          w: novaLargura,
          h: novaAltura,
          x: alvoX - fracaoX * novaLargura,
          y: alvoY - fracaoY * novaAltura,
        });
      });
    },
    [enquadrar],
  );

  /**
   * `wheel` precisa de listener nativo nao-passivo: React registra onWheel de
   * forma passiva, e um listener passivo nao pode chamar preventDefault - a
   * pagina rolaria junto com o zoom.
   */
  useEffect(() => {
    const svg = refSvg.current;
    if (!svg) return;
    const aoRolar = (evento: WheelEvent) => {
      evento.preventDefault();
      const fator = evento.deltaY < 0 ? 1.15 : 1 / 1.15;
      aplicarZoom(fator, { x: evento.clientX, y: evento.clientY });
    };
    svg.addEventListener('wheel', aoRolar, { passive: false });
    return () => svg.removeEventListener('wheel', aoRolar);
  }, [aplicarZoom]);

  const onPointerDown = useCallback((evento: React.PointerEvent<SVGSVGElement>) => {
    ponteiros.current.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });
    if (ponteiros.current.size === 1) setArrastando(true);
    evento.currentTarget.setPointerCapture(evento.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (evento: React.PointerEvent<SVGSVGElement>) => {
      const anterior = ponteiros.current.get(evento.pointerId);
      if (!anterior) return;
      const atual = { x: evento.clientX, y: evento.clientY };
      ponteiros.current.set(evento.pointerId, atual);

      const svg = refSvg.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();

      // Dois dedos: pinca. A janela acompanha a razao entre as distancias.
      if (ponteiros.current.size === 2) {
        const [a, b] = [...ponteiros.current.values()];
        if (!a || !b) return;
        const distancia = Math.hypot(a.x - b.x, a.y - b.y);
        if (distanciaPinca.current !== null && distanciaPinca.current > 0) {
          const fator = distancia / distanciaPinca.current;
          aplicarZoom(fator, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        }
        distanciaPinca.current = distancia;
        return;
      }

      const deslocouX = atual.x - anterior.x;
      const deslocouY = atual.y - anterior.y;
      setVista((vistaAnterior) =>
        enquadrar({
          ...vistaAnterior,
          x: vistaAnterior.x - deslocouX * (vistaAnterior.w / rect.width),
          y: vistaAnterior.y - deslocouY * (vistaAnterior.h / rect.height),
        }),
      );
    },
    [aplicarZoom, enquadrar],
  );

  const encerrarPonteiro = useCallback((evento: React.PointerEvent<SVGSVGElement>) => {
    ponteiros.current.delete(evento.pointerId);
    if (ponteiros.current.size < 2) distanciaPinca.current = null;
    if (ponteiros.current.size === 0) setArrastando(false);
  }, []);

  const zoom = vistaCompleta.w / vista.w;

  return {
    vista,
    viewBox: `${vista.x.toFixed(2)} ${vista.y.toFixed(2)} ${vista.w.toFixed(2)} ${vista.h.toFixed(2)}`,
    zoom,
    arrastando,
    podeAmpliar: zoom < ZOOM_MAX - 0.01,
    podeReduzir: zoom > ZOOM_MIN + 0.01,
    ampliar: useCallback(() => aplicarZoom(PASSO_BOTAO), [aplicarZoom]),
    reduzir: useCallback(() => aplicarZoom(1 / PASSO_BOTAO), [aplicarZoom]),
    resetar: useCallback(() => setVista(vistaCompleta), [vistaCompleta]),
    refSvg,
    manipuladores: {
      onPointerDown,
      onPointerMove,
      onPointerUp: encerrarPonteiro,
      onPointerCancel: encerrarPonteiro,
    },
  };
}
