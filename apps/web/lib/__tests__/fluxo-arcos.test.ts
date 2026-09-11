/**
 * Testes da logica pura do mapa de fluxo (Fase 5.11).
 *
 * Cobrem as regras que o mapa nao pode quebrar: par suprimido nunca vira arco,
 * o proprio municipio nunca vira arco, "nenhum volume visivel" e null (nunca 0),
 * e URL invalida nunca derruba a tela.
 */
import { describe, expect, it } from 'vitest';
import {
  TOP_PADRAO,
  caminhoDoArco,
  interpretarFiltrosFluxo,
  larguraDoArco,
  montarArcos,
  normalizarBusca,
  resumirEntradas,
  selecionarTopN,
  type ItemFluxo,
} from '../fluxo-arcos';

const params = (query: string) => new URLSearchParams(query);

function item(id: number, internacoes: number | null, extra: Partial<ItemFluxo> = {}): ItemFluxo {
  return {
    municipio: { id, nome: `M${id}`, codigoIbge7: `35${String(id).padStart(5, '0')}` },
    internacoes,
    suprimido: internacoes === null,
    mesmoMunicipio: false,
    ...extra,
  };
}

describe('interpretarFiltrosFluxo', () => {
  it('URL vazia: nenhum municipio, modo origem, Top padrao e ano resolvido pela API', () => {
    expect(interpretarFiltrosFluxo(params(''))).toEqual({
      municipioId: undefined,
      modo: 'origem',
      top: TOP_PADRAO,
      ano: undefined,
    });
  });

  it('le valores validos', () => {
    expect(interpretarFiltrosFluxo(params('municipio=302&modo=destino&top=20&ano=2024'))).toEqual({
      municipioId: 302,
      modo: 'destino',
      top: 20,
      ano: 2024,
    });
    expect(interpretarFiltrosFluxo(params('top=todos')).top).toBe('todos');
  });

  it('valor invalido cai no padrao em vez de quebrar a tela', () => {
    expect(interpretarFiltrosFluxo(params('municipio=abc&modo=xyz&top=7&ano=-1'))).toEqual({
      municipioId: undefined,
      modo: 'origem',
      top: TOP_PADRAO,
      ano: undefined,
    });
    expect(interpretarFiltrosFluxo(params('municipio=0')).municipioId).toBeUndefined();
    expect(interpretarFiltrosFluxo(params('municipio=1.5')).municipioId).toBeUndefined();
  });
});

describe('selecionarTopN', () => {
  const itens = [{ valor: 5 }, { valor: 50 }, { valor: 20 }, { valor: 1 }];

  it('devolve os N maiores, do maior para o menor', () => {
    expect(selecionarTopN(itens, 5).map((i) => i.valor)).toEqual([50, 20, 5, 1]);
    expect(selecionarTopN(
      Array.from({ length: 30 }, (_, i) => ({ valor: i })),
      10,
    )).toHaveLength(10);
  });

  it('"todos" nao corta nada', () => {
    const muitos = Array.from({ length: 171 }, (_, i) => ({ valor: i }));
    expect(selecionarTopN(muitos, 'todos')).toHaveLength(171);
  });

  it('nao altera a lista original', () => {
    const copia = [...itens];
    selecionarTopN(itens, 5);
    expect(itens).toEqual(copia);
  });
});

describe('larguraDoArco', () => {
  it('e monotonica: mais internacoes, arco mais grosso', () => {
    expect(larguraDoArco(10, 100)).toBeLessThan(larguraDoArco(50, 100));
    expect(larguraDoArco(50, 100)).toBeLessThan(larguraDoArco(100, 100));
  });

  it('respeita os limites', () => {
    expect(larguraDoArco(100, 100)).toBe(9);
    expect(larguraDoArco(0, 100)).toBe(1.25);
    expect(larguraDoArco(10, 0)).toBe(1.25);
    expect(larguraDoArco(500, 100)).toBe(9);
  });
});

describe('caminhoDoArco', () => {
  const pontoDeControle = (d: string) => {
    const [, x, y] = d.match(/Q (-?[\d.]+) (-?[\d.]+)/) ?? [];
    return [Number(x), Number(y)];
  };

  it('comeca na origem e termina no destino', () => {
    const d = caminhoDoArco([10, 20], [110, 20]);
    expect(d).toMatch(/^M 10\.0 20\.0 Q .* 110\.0 20\.0$/);
  });

  it('A->B e B->A curvam para lados opostos (nunca se sobrepoem)', () => {
    const ida = pontoDeControle(caminhoDoArco([0, 0], [100, 0])!);
    const volta = pontoDeControle(caminhoDoArco([100, 0], [0, 0])!);
    expect(Math.sign(ida[1]!)).toBe(-Math.sign(volta[1]!));
  });

  it('pontas coincidentes nao geram arco', () => {
    expect(caminhoDoArco([5, 5], [5, 5])).toBeNull();
  });
});

describe('montarArcos', () => {
  const itens = [item(1, 124), item(2, null), item(3, 32, { mesmoMunicipio: true }), item(4, 46)];

  it('par suprimido e o proprio municipio nunca viram arco', () => {
    const arcos = montarArcos('origem', '3500016', itens);
    expect(arcos.map((a) => a.municipioId)).toEqual([1, 4]);
  });

  it('modo origem: o selecionado e a origem e o item e o destino', () => {
    const [arco] = montarArcos('origem', '3500016', [item(1, 124)]);
    expect(arco).toMatchObject({ origem: '3500016', destino: '3500001', contraparte: '3500001', valor: 124 });
  });

  it('modo destino: o sentido se inverte', () => {
    const [arco] = montarArcos('destino', '3525300', [item(1, 124)]);
    expect(arco).toMatchObject({ origem: '3500001', destino: '3525300', contraparte: '3500001' });
  });
});

describe('resumirEntradas', () => {
  it('soma so o volume visivel vindo de fora e separa os residentes locais', () => {
    const resumo = resumirEntradas([item(1, 100), item(2, 50), item(3, 32, { mesmoMunicipio: true }), item(4, null)]);
    expect(resumo).toEqual({
      internacoesDeFora: 150,
      origensVisiveis: 2,
      residentesLocais: 32,
      residentesLocaisSuprimido: false,
      paresSuprimidos: 1,
    });
  });

  it('todos os pares de fora suprimidos: volume e null, nunca 0', () => {
    const resumo = resumirEntradas([item(1, null), item(2, null), item(3, 32, { mesmoMunicipio: true })]);
    expect(resumo.internacoesDeFora).toBeNull();
    expect(resumo.origensVisiveis).toBe(0);
    expect(resumo.paresSuprimidos).toBe(2);
  });

  it('par local suprimido e contado e sinalizado', () => {
    const resumo = resumirEntradas([item(3, null, { mesmoMunicipio: true })]);
    expect(resumo.residentesLocais).toBeNull();
    expect(resumo.residentesLocaisSuprimido).toBe(true);
    expect(resumo.paresSuprimidos).toBe(1);
  });

  it('lista vazia: nada visivel, nada suprimido', () => {
    expect(resumirEntradas([])).toEqual({
      internacoesDeFora: null,
      origensVisiveis: 0,
      residentesLocais: null,
      residentesLocaisSuprimido: false,
      paresSuprimidos: 0,
    });
  });
});

describe('normalizarBusca', () => {
  it('ignora acento e caixa', () => {
    expect(normalizarBusca('  São José do Rio Preto ')).toBe('sao jose do rio preto');
    expect(normalizarBusca('JAÚ')).toBe('jau');
  });
});
