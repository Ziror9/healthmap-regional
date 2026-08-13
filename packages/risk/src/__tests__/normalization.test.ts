import { describe, expect, it } from 'vitest';
import { normalizarPercentilCoorte } from '../normalization.js';

describe('normalizarPercentilCoorte', () => {
  it('coorte vazia retorna mapa vazio', () => {
    expect(normalizarPercentilCoorte([], 'MAIOR_PIOR').size).toBe(0);
  });

  it('coorte de 1 item retorna percentil neutro 0.5 (dados insuficientes)', () => {
    const resultado = normalizarPercentilCoorte([{ chave: 'a', valor: 10 }], 'MAIOR_PIOR');
    expect(resultado.get('a')).toBe(0.5);
  });

  it('valores iguais recebem o mesmo percentil (0.5, empate simetrico)', () => {
    const resultado = normalizarPercentilCoorte(
      [
        { chave: 'a', valor: 5 },
        { chave: 'b', valor: 5 },
        { chave: 'c', valor: 5 },
      ],
      'MAIOR_PIOR',
    );
    expect(resultado.get('a')).toBe(0.5);
    expect(resultado.get('b')).toBe(0.5);
    expect(resultado.get('c')).toBe(0.5);
  });

  it('MAIOR_PIOR: menor valor recebe percentil 0, maior valor recebe percentil 1', () => {
    const resultado = normalizarPercentilCoorte(
      [
        { chave: 'baixo', valor: 1 },
        { chave: 'meio', valor: 5 },
        { chave: 'alto', valor: 10 },
      ],
      'MAIOR_PIOR',
    );
    expect(resultado.get('baixo')).toBe(0);
    expect(resultado.get('meio')).toBe(0.5);
    expect(resultado.get('alto')).toBe(1);
  });

  it('MENOR_PIOR: inverte a polaridade (menor valor recebe percentil 1)', () => {
    const resultado = normalizarPercentilCoorte(
      [
        { chave: 'baixo', valor: 1 },
        { chave: 'alto', valor: 10 },
      ],
      'MENOR_PIOR',
    );
    expect(resultado.get('baixo')).toBe(1);
    expect(resultado.get('alto')).toBe(0);
  });

  it('conjunto pequeno (n=2) distribui 0 e 1', () => {
    const resultado = normalizarPercentilCoorte(
      [
        { chave: 'a', valor: 2 },
        { chave: 'b', valor: 8 },
      ],
      'MAIOR_PIOR',
    );
    expect([...resultado.values()].sort()).toEqual([0, 1]);
  });

  it('e deterministico: mesma entrada produz sempre a mesma saida', () => {
    const itens = [
      { chave: 'a', valor: 3 },
      { chave: 'b', valor: 7 },
      { chave: 'c', valor: 3 },
      { chave: 'd', valor: 9 },
    ];
    const r1 = normalizarPercentilCoorte(itens, 'MAIOR_PIOR');
    const r2 = normalizarPercentilCoorte(itens, 'MAIOR_PIOR');
    expect([...r1.entries()]).toEqual([...r2.entries()]);
  });
});
