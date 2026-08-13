/**
 * Normalizacao por percentil dentro da coorte (docs/risk-methodology.md #3).
 *
 * "A normalizacao proposta e por percentil dentro da coorte (municipios de
 * SP na mesma competencia). Justificativa: a capital e um outlier estrutural
 * de volume. Uma normalizacao min-max comprimiria todos os demais municipios
 * contra o zero, tornando o ranking ilegivel."
 *
 * Formula implementada: rank percentil com tratamento de empates por rank
 * medio ("competition ranking" nao e usado - empates recebem o MESMO
 * percentil, a media das posicoes que ocupariam). Isso e necessario para
 * determinismo: sem tratar empates, dois municipios com o mesmo valor
 * bruto poderiam receber percentis diferentes dependendo so da ordem de
 * insercao, o que violaria "normalizacao deve ser deterministica".
 */
import type { Direcao } from './types.js';

export interface ItemCoorte<T> {
  chave: T;
  valor: number;
}

/**
 * Convencoes para coortes degeneradas (NAO especificadas em
 * docs/risk-methodology.md - decisoes de implementacao, documentadas aqui
 * para nao ficarem implicitas):
 *  - coorte vazia: retorna mapa vazio;
 *  - coorte de 1 item: nao ha distribuicao para posicionar o valor contra
 *    nada - retorna percentil neutro 0.5 (nem "melhor" nem "pior" da
 *    coorte, porque uma coorte de tamanho 1 nao tem "melhor"/"pior").
 */
export function normalizarPercentilCoorte<T>(
  itens: readonly ItemCoorte<T>[],
  direcao: Direcao,
): Map<T, number> {
  const resultado = new Map<T, number>();
  const n = itens.length;
  if (n === 0) return resultado;
  if (n === 1) {
    resultado.set(itens[0]!.chave, 0.5);
    return resultado;
  }

  const ordenado = [...itens].sort((a, b) => a.valor - b.valor);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && ordenado[j + 1]!.valor === ordenado[i]!.valor) {
      j += 1;
    }
    const rankMedio = (i + j) / 2;
    const percentil = rankMedio / (n - 1);
    for (let k = i; k <= j; k += 1) {
      resultado.set(ordenado[k]!.chave, percentil);
    }
    i = j + 1;
  }

  if (direcao === 'MENOR_PIOR') {
    for (const [chave, percentil] of resultado) {
      resultado.set(chave, 1 - percentil);
    }
  }

  return resultado;
}
