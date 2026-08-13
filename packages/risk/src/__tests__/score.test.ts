import { describe, expect, it } from 'vitest';
import { normalizarComponentesNaCoorte, calcularScore, classificarPorQuintil } from '../score.js';
import type { ComponenteResultado, RiskConfigInput } from '../types.js';

function pressao(valorBruto: number | null, confiabilidade: 'ALTA' | 'BAIXA' = 'ALTA'): ComponenteResultado {
  return {
    componente: 'PRESSAO_HOSPITALAR_ESTIMADA',
    disponivel: valorBruto !== null,
    valorBruto,
    valorNormalizado: null,
    natureza: 'ESTIMATIVA',
    confiabilidade,
    ...(valorBruto === null ? { motivoIndisponibilidade: 'teste' } : {}),
  };
}

describe('normalizarComponentesNaCoorte', () => {
  it('normaliza por percentil dentro da coorte, so para componentes disponiveis', () => {
    const porMunicipio = new Map<number, ComponenteResultado[]>([
      [1, [pressao(1)]],
      [2, [pressao(5)]],
      [3, [pressao(10)]],
    ]);
    const resultado = normalizarComponentesNaCoorte(porMunicipio, 'MAIOR_PIOR');
    expect(resultado.get(1)![0]!.valorNormalizado).toBe(0);
    expect(resultado.get(2)![0]!.valorNormalizado).toBe(0.5);
    expect(resultado.get(3)![0]!.valorNormalizado).toBe(1);
  });

  it('componente indisponivel fica de fora da coorte e nao recebe valorNormalizado', () => {
    const porMunicipio = new Map<number, ComponenteResultado[]>([
      [1, [pressao(1)]],
      [2, [pressao(null)]],
    ]);
    const resultado = normalizarComponentesNaCoorte(porMunicipio, 'MAIOR_PIOR');
    expect(resultado.get(1)![0]!.valorNormalizado).toBe(0.5); // coorte efetiva de 1 disponivel -> neutro
    expect(resultado.get(2)![0]!.valorNormalizado).toBeNull();
  });
});

describe('calcularScore', () => {
  const configEqualWeight: RiskConfigInput = {
    id: 1,
    limiarVolumeMinimo: 30,
    componentes: [
      { componente: 'PRESSAO_HOSPITALAR_ESTIMADA', peso: 0.25 },
      { componente: 'TENDENCIA', peso: 0.25 },
      { componente: 'SEVERIDADE', peso: 0.25 },
      { componente: 'VULNERABILIDADE', peso: 0.25 },
    ],
  };

  it('renormaliza pesos quando so 1 de 4 componentes esta disponivel (equivale a 100% nele)', () => {
    const resultados: ComponenteResultado[] = [
      { ...pressao(1), valorNormalizado: 0.8 },
      { componente: 'TENDENCIA', disponivel: false, valorBruto: null, valorNormalizado: null, natureza: 'OBSERVADO', confiabilidade: 'BAIXA' },
      { componente: 'SEVERIDADE', disponivel: false, valorBruto: null, valorNormalizado: null, natureza: 'OBSERVADO', confiabilidade: 'BAIXA' },
      { componente: 'VULNERABILIDADE', disponivel: false, valorBruto: null, valorNormalizado: null, natureza: 'ESTIMATIVA', confiabilidade: 'BAIXA' },
    ];
    const score = calcularScore(resultados, configEqualWeight);
    expect(score.disponivel).toBe(true);
    expect(score.indice).toBeCloseTo(0.8);
  });

  it('nenhum componente disponivel -> score indisponivel', () => {
    const resultados: ComponenteResultado[] = [
      { componente: 'PRESSAO_HOSPITALAR_ESTIMADA', disponivel: false, valorBruto: null, valorNormalizado: null, natureza: 'ESTIMATIVA', confiabilidade: 'BAIXA' },
    ];
    const score = calcularScore(resultados, configEqualWeight);
    expect(score.disponivel).toBe(false);
    expect(score.indice).toBeNull();
    expect(score.classificacao).toBeNull();
  });

  it('soma ponderada correta com pesos diferentes (fixture de teste, nao pesos oficiais)', () => {
    const configPesosDiferentes: RiskConfigInput = {
      id: 2,
      limiarVolumeMinimo: 30,
      componentes: [
        { componente: 'PRESSAO_HOSPITALAR_ESTIMADA', peso: 0.7 },
        { componente: 'SEVERIDADE', peso: 0.3 },
      ],
    };
    const resultados: ComponenteResultado[] = [
      { ...pressao(1), valorNormalizado: 1 },
      { componente: 'SEVERIDADE', disponivel: true, valorBruto: 5, valorNormalizado: 0, natureza: 'OBSERVADO', confiabilidade: 'ALTA' },
    ];
    const score = calcularScore(resultados, configPesosDiferentes);
    expect(score.indice).toBeCloseTo(0.7 * 1 + 0.3 * 0);
  });

  it('confiabilidade do score e a pior entre os componentes contribuintes', () => {
    const resultados: ComponenteResultado[] = [
      { ...pressao(1, 'ALTA'), valorNormalizado: 0.5 },
      { componente: 'SEVERIDADE', disponivel: true, valorBruto: 1, valorNormalizado: 0.5, natureza: 'OBSERVADO', confiabilidade: 'BAIXA' },
    ];
    const config: RiskConfigInput = {
      id: 1,
      limiarVolumeMinimo: 30,
      componentes: [
        { componente: 'PRESSAO_HOSPITALAR_ESTIMADA', peso: 0.5 },
        { componente: 'SEVERIDADE', peso: 0.5 },
      ],
    };
    expect(calcularScore(resultados, config).confiabilidade).toBe('BAIXA');
  });

  it('natureza e OBSERVADO somente se todos os contribuintes forem OBSERVADO', () => {
    const configSeveridade: RiskConfigInput = {
      id: 1,
      limiarVolumeMinimo: 30,
      componentes: [{ componente: 'SEVERIDADE', peso: 1 }],
    };
    const soObservado: ComponenteResultado[] = [
      { componente: 'SEVERIDADE', disponivel: true, valorBruto: 1, valorNormalizado: 0.5, natureza: 'OBSERVADO', confiabilidade: 'ALTA' },
    ];
    expect(calcularScore(soObservado, configSeveridade).natureza).toBe('OBSERVADO');

    const misto: ComponenteResultado[] = [
      { ...pressao(1, 'ALTA'), valorNormalizado: 0.5 },
      { componente: 'SEVERIDADE', disponivel: true, valorBruto: 1, valorNormalizado: 0.5, natureza: 'OBSERVADO', confiabilidade: 'ALTA' },
    ];
    const configMista: RiskConfigInput = {
      id: 1,
      limiarVolumeMinimo: 30,
      componentes: [
        { componente: 'PRESSAO_HOSPITALAR_ESTIMADA', peso: 0.5 },
        { componente: 'SEVERIDADE', peso: 0.5 },
      ],
    };
    expect(calcularScore(misto, configMista).natureza).toBe('ESTIMATIVA');
  });

  it('e deterministico: mesma entrada + mesma config produz sempre o mesmo indice', () => {
    const resultados: ComponenteResultado[] = [{ ...pressao(3.3), valorNormalizado: 0.37 }];
    const a = calcularScore(resultados, configEqualWeight);
    const b = calcularScore(resultados, configEqualWeight);
    expect(a.indice).toBe(b.indice);
  });

  it('configs diferentes (limiarVolumeMinimo) produzem confiabilidade diferente para o mesmo dado bruto', () => {
    // reproduz o cenario real do seed: mesma celula, duas RiskConfig com limiar diferente
    const volume = 40;
    const configLimiarBaixo: RiskConfigInput = { id: 1, limiarVolumeMinimo: 30, componentes: [{ componente: 'PRESSAO_HOSPITALAR_ESTIMADA', peso: 1 }] };
    const configLimiarAlto: RiskConfigInput = { id: 2, limiarVolumeMinimo: 100, componentes: [{ componente: 'PRESSAO_HOSPITALAR_ESTIMADA', peso: 1 }] };

    const resultadoBase = {
      componente: 'PRESSAO_HOSPITALAR_ESTIMADA' as const,
      disponivel: true,
      valorBruto: 1,
      valorNormalizado: 0.5,
      natureza: 'ESTIMATIVA' as const,
    };
    const rBaixo = calcularScore(
      [{ ...resultadoBase, confiabilidade: volume < configLimiarBaixo.limiarVolumeMinimo ? 'BAIXA' : 'ALTA' }],
      configLimiarBaixo,
    );
    const rAlto = calcularScore(
      [{ ...resultadoBase, confiabilidade: volume < configLimiarAlto.limiarVolumeMinimo ? 'BAIXA' : 'ALTA' }],
      configLimiarAlto,
    );
    expect(rBaixo.confiabilidade).toBe('ALTA');
    expect(rAlto.confiabilidade).toBe('BAIXA');
  });
});

describe('classificarPorQuintil', () => {
  it('distribui 5 municipios em 5 faixas distintas (maior indice = pior classificacao)', () => {
    const indices = new Map([
      [1, 0.1],
      [2, 0.3],
      [3, 0.5],
      [4, 0.7],
      [5, 0.9],
    ]);
    const classificacao = classificarPorQuintil(indices);
    expect(classificacao.get(1)).toBe('MUITO_BAIXO');
    expect(classificacao.get(2)).toBe('BAIXO');
    expect(classificacao.get(3)).toBe('MEDIO');
    expect(classificacao.get(4)).toBe('ALTO');
    expect(classificacao.get(5)).toBe('CRITICO');
  });

  it('coorte pequena (1 municipio) nao quebra e retorna uma classificacao', () => {
    const classificacao = classificarPorQuintil(new Map([[1, 0.5]]));
    expect(classificacao.get(1)).toBeDefined();
  });

  it('coorte vazia retorna mapa vazio', () => {
    expect(classificarPorQuintil(new Map()).size).toBe(0);
  });
});
