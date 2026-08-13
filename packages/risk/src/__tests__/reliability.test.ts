import { describe, expect, it } from 'vitest';
import { calcularConfiabilidade } from '../reliability.js';

describe('calcularConfiabilidade', () => {
  it('volume abaixo do limiar -> BAIXA', () => {
    expect(calcularConfiabilidade(10, 30)).toBe('BAIXA');
  });

  it('volume igual ao limiar -> ALTA (limiar e inclusivo)', () => {
    expect(calcularConfiabilidade(30, 30)).toBe('ALTA');
  });

  it('volume acima do limiar -> ALTA', () => {
    expect(calcularConfiabilidade(1000, 30)).toBe('ALTA');
  });

  it('volume zero -> BAIXA', () => {
    expect(calcularConfiabilidade(0, 30)).toBe('BAIXA');
  });

  it('nunca retorna MEDIA (segundo limiar nao esta documentado)', () => {
    const amostras = [0, 1, 5, 29, 30, 31, 100, 10_000];
    for (const volume of amostras) {
      expect(['ALTA', 'BAIXA']).toContain(calcularConfiabilidade(volume, 30));
    }
  });
});
