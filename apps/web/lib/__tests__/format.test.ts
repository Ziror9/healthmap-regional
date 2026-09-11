/**
 * Formatacao de numeros exibidos. Regra da interface: todo numero na tela usa
 * a convencao pt-BR (virgula decimal, ponto de milhar) e passa por
 * lib/format.ts - `toFixed` fica restrito a coordenadas de SVG.
 */
import { describe, expect, it } from 'vitest';
import { formatIndice, formatNumero, formatPercentual } from '../format';

describe('formatIndice', () => {
  it('duas casas com virgula decimal', () => {
    expect(formatIndice(1)).toBe('1,00');
    expect(formatIndice(0.9375)).toBe('0,94');
    expect(formatIndice(0.0625)).toBe('0,06');
  });
});

describe('formatNumero', () => {
  it('ponto de milhar e virgula decimal', () => {
    expect(formatNumero(19584)).toBe('19.584');
    expect(formatNumero(3.4646, 4)).toBe('3,4646');
  });
});

describe('formatPercentual', () => {
  it('recebe proporcao 0-1 e devolve percentual com virgula', () => {
    expect(formatPercentual(0.8632)).toBe('86,3%');
    expect(formatPercentual(0.024)).toBe('2,4%');
    expect(formatPercentual(1)).toBe('100,0%');
  });
});
