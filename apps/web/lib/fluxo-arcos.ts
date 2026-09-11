import type { Ponto } from './geo-projection';

/**
 * Logica pura do mapa de fluxo assistencial (Fase 5.11).
 *
 * Sem React, sem DOM, sem requisicao: recebe o que a API ja devolveu e decide
 * o que desenhar. Fica fora do componente para ser testavel e para que uma
 * futura visao ESTADUAL (todos os pares de uma vez, que hoje nao tem endpoint)
 * reaproveite exatamente as mesmas regras - so a origem dos dados muda.
 *
 * Regras que este modulo garante, e que os testes cobrem:
 *  - par SUPRIMIDO (n<5) nunca vira arco: o valor nao pode ser divulgado, e
 *    desenha-lo com qualquer espessura seria inventar uma magnitude;
 *  - o proprio municipio nunca vira arco: atendimento na propria cidade nao e
 *    deslocamento (aparece no resumo, nao no mapa);
 *  - nenhuma soma de itens suprimidos: "nenhum volume visivel" e `null`,
 *    nunca 0 - "menos de 5 em cada par" e diferente de "ninguem".
 */

export type ModoFluxo = 'origem' | 'destino';
export type TopN = 5 | 10 | 20 | 'todos';
export const OPCOES_TOP: readonly TopN[] = [5, 10, 20, 'todos'];
export const TOP_PADRAO: TopN = 10;

/** Formato minimo de um item de fluxo da API (estruturalmente compativel com FluxoItemDTO). */
export interface ItemFluxo {
  municipio: { id: number; nome: string; codigoIbge7: string };
  internacoes: number | null;
  suprimido: boolean;
  mesmoMunicipio: boolean;
}

export interface ArcoFluxo {
  /** codigoIbge7 do municipio de RESIDENCIA (de onde o paciente sai). */
  origem: string;
  /** codigoIbge7 do municipio de INTERNACAO (onde a internacao acontece). */
  destino: string;
  /** codigoIbge7 da ponta que NAO e o municipio selecionado - onde vao o ponto e o rotulo. */
  contraparte: string;
  municipioId: number;
  rotulo: string;
  valor: number;
}

export interface FiltrosFluxo {
  municipioId?: number;
  modo: ModoFluxo;
  top: TopN;
  ano?: number;
}

function inteiroPositivo(valor: string | null): number | undefined {
  if (valor === null) return undefined;
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : undefined;
}

/**
 * Le os filtros da URL. Valor invalido cai no padrao em vez de quebrar a
 * tela - um link velho ou digitado a mao sempre abre alguma coisa util.
 */
export function interpretarFiltrosFluxo(params: { get(chave: string): string | null }): FiltrosFluxo {
  const top = params.get('top');
  const topValido: TopN = top === 'todos' ? 'todos' : top === '5' ? 5 : top === '20' ? 20 : top === '10' ? 10 : TOP_PADRAO;
  return {
    municipioId: inteiroPositivo(params.get('municipio')),
    modo: params.get('modo') === 'destino' ? 'destino' : 'origem',
    top: topValido,
    ano: inteiroPositivo(params.get('ano')),
  };
}

/** Os N maiores por valor, do maior para o menor. Empates mantem a ordem de entrada. */
export function selecionarTopN<T extends { valor: number }>(itens: readonly T[], top: TopN): T[] {
  const ordenados = [...itens].sort((a, b) => b.valor - a.valor);
  return top === 'todos' ? ordenados : ordenados.slice(0, top);
}

/**
 * Espessura do arco em pixels de TELA (o SVG desenha com
 * `vector-effect: non-scaling-stroke`, entao a espessura nao muda com o zoom).
 *
 * Escala de raiz quadrada: numa selecao como Sao Paulo, os destinos vao de
 * dezenas a milhares de internacoes; na escala linear os fluxos pequenos
 * sumiriam abaixo de um pixel. A raiz preserva a ORDEM (monotonica) e mantem
 * os pequenos visiveis. O numero exato fica no ranking ao lado.
 */
export function larguraDoArco(valor: number, maximo: number, limites = { min: 1.25, max: 9 }): number {
  if (maximo <= 0 || valor <= 0) return limites.min;
  const proporcao = Math.sqrt(Math.min(valor, maximo) / maximo);
  return limites.min + (limites.max - limites.min) * proporcao;
}

function fmt(n: number): string {
  return n.toFixed(1);
}

/**
 * Curva quadratica de `a` ate `b`, com o ponto de controle deslocado para a
 * ESQUERDA do sentido a->b (em coordenadas de tela, Y para baixo). Dois
 * efeitos: A->B e B->A curvam para lados opostos e nunca se sobrepoem, e a
 * curvatura consistente da leitura de sentido sem precisar de seta.
 * `null` quando as pontas coincidem - nao ha arco a desenhar.
 */
export function caminhoDoArco(a: Ponto, b: Ponto, curvatura = 0.2): string | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (Math.hypot(dx, dy) < 0.5) return null;
  const cx = (a[0] + b[0]) / 2 + dy * curvatura;
  const cy = (a[1] + b[1]) / 2 - dx * curvatura;
  return `M ${fmt(a[0])} ${fmt(a[1])} Q ${fmt(cx)} ${fmt(cy)} ${fmt(b[0])} ${fmt(b[1])}`;
}

/**
 * Itens da API -> arcos desenhaveis. Exclui suprimidos e o proprio municipio
 * (ver cabecalho). No modo `origem` os itens sao os DESTINOS do selecionado;
 * no modo `destino`, as ORIGENS dos pacientes que ele atende.
 */
export function montarArcos(modo: ModoFluxo, selecionadoCodigo: string, itens: readonly ItemFluxo[]): ArcoFluxo[] {
  return itens
    .filter((item): item is ItemFluxo & { internacoes: number } => !item.suprimido && !item.mesmoMunicipio && item.internacoes !== null)
    .map((item) => ({
      origem: modo === 'origem' ? selecionadoCodigo : item.municipio.codigoIbge7,
      destino: modo === 'origem' ? item.municipio.codigoIbge7 : selecionadoCodigo,
      contraparte: item.municipio.codigoIbge7,
      municipioId: item.municipio.id,
      rotulo: item.municipio.nome,
      valor: item.internacoes,
    }));
}

export interface ResumoEntradas {
  /** Soma das internacoes VISIVEIS vindas de outros municipios. `null` quando nenhum par de fora e visivel. */
  internacoesDeFora: number | null;
  origensVisiveis: number;
  /** Internacoes de quem mora no proprio municipio. `null` se o par estiver suprimido ou nao existir. */
  residentesLocais: number | null;
  residentesLocaisSuprimido: boolean;
  paresSuprimidos: number;
}

/**
 * Resumo do lado DESTINO (quem um municipio atende). A API ja entrega o
 * resumo do lado origem; para o destino, a pagina soma os itens que a mesma
 * resposta trouxe - agregacao de apresentacao, no mesmo espirito dos KPIs da
 * Visao Geral. O teste de API confere que essa soma bate com o ranking de
 * polos (`/api/fluxo/polos`), que calcula o mesmo numero no servidor.
 */
export function resumirEntradas(itens: readonly ItemFluxo[]): ResumoEntradas {
  let soma = 0;
  let origensVisiveis = 0;
  let residentesLocais: number | null = null;
  let residentesLocaisSuprimido = false;
  let paresSuprimidos = 0;

  for (const item of itens) {
    if (item.suprimido || item.internacoes === null) {
      paresSuprimidos += 1;
      if (item.mesmoMunicipio) residentesLocaisSuprimido = true;
      continue;
    }
    if (item.mesmoMunicipio) {
      residentesLocais = item.internacoes;
      continue;
    }
    soma += item.internacoes;
    origensVisiveis += 1;
  }

  return {
    internacoesDeFora: origensVisiveis > 0 ? soma : null,
    origensVisiveis,
    residentesLocais,
    residentesLocaisSuprimido,
    paresSuprimidos,
  };
}

/** Normaliza para busca: sem acento, minusculas. "São José" e "sao jose" batem. */
export function normalizarBusca(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}
