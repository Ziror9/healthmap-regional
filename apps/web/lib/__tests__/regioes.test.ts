/**
 * Testes da logica pura da pagina de Regioes de Saude (redesign E6).
 */
import { describe, expect, it } from 'vitest';
import {
  agruparMunicipiosPorRegiao,
  contarPorClassificacao,
  indexarPorRegiao,
  interpretarRegiaoId,
  motivoIndisponibilidadeRegional,
  ordenarPorIndice,
  type ScoreRegionalMinimo,
} from '../regioes';

function score(id: number, nome: string, indice: number, classificacao: ScoreRegionalMinimo['classificacao']): ScoreRegionalMinimo {
  return { regiaoSaude: { id, nome, codigo: `DRS-${id}` }, indice, classificacao };
}

describe('interpretarRegiaoId', () => {
  it('le id valido', () => {
    expect(interpretarRegiaoId('17')).toBe(17);
  });

  it('ausente ou invalido: nenhuma selecao', () => {
    expect(interpretarRegiaoId(null)).toBeUndefined();
    for (const invalido of ['', 'abc', '0', '-3', '2.5']) expect(interpretarRegiaoId(invalido)).toBeUndefined();
  });
});

describe('indexarPorRegiao', () => {
  it('indexa pelo id da DRS', () => {
    const mapa = indexarPorRegiao([score(6, 'Grande São Paulo', 0.6, 'MEDIO'), score(17, 'Registro', 1, 'CRITICO')]);
    expect(mapa.get(17)?.classificacao).toBe('CRITICO');
    expect(mapa.get(1)).toBeUndefined();
  });
});

describe('agruparMunicipiosPorRegiao', () => {
  it('agrupa por DRS e ordena os nomes em pt-BR', () => {
    const regiao = { id: 6, nome: 'Grande São Paulo' };
    const grupos = agruparMunicipiosPorRegiao([
      { id: 3, nome: 'Osasco', codigoIbge7: '3534401', regiaoSaude: regiao },
      { id: 1, nome: 'Arujá', codigoIbge7: '3503901', regiaoSaude: regiao },
      { id: 2, nome: 'Registro', codigoIbge7: '3542602', regiaoSaude: { id: 17, nome: 'Registro' } },
      { id: 4, nome: 'Águas de Lindóia', codigoIbge7: '3500501', regiaoSaude: regiao },
    ]);
    expect(grupos.get(6)?.map((m) => m.nome)).toEqual(['Águas de Lindóia', 'Arujá', 'Osasco']);
    expect(grupos.get(17)).toHaveLength(1);
  });
});

describe('ordenarPorIndice', () => {
  it('maior indice primeiro, empate pelo nome, sem alterar a entrada', () => {
    const entrada = [
      score(22, 'Taubaté', 0.0625, 'MUITO_BAIXO'),
      score(17, 'Registro', 1, 'CRITICO'),
      score(19, 'São João da Boa Vista', 0.0625, 'MUITO_BAIXO'),
    ];
    const copia = [...entrada];
    expect(ordenarPorIndice(entrada).map((s) => s.regiaoSaude.nome)).toEqual([
      'Registro',
      'São João da Boa Vista',
      'Taubaté',
    ]);
    expect(entrada).toEqual(copia);
  });
});

describe('contarPorClassificacao', () => {
  it('conta cada faixa e mantem as faixas vazias com 0', () => {
    expect(
      contarPorClassificacao([score(1, 'A', 1, 'CRITICO'), score(2, 'B', 0.9, 'CRITICO'), score(3, 'C', 0.1, 'MUITO_BAIXO')]),
    ).toEqual({ CRITICO: 2, ALTO: 0, MEDIO: 0, BAIXO: 0, MUITO_BAIXO: 1 });
  });
});

describe('motivoIndisponibilidadeRegional', () => {
  it('fala da regiao, nao do municipio, e nao chama o IPVS de fonte indefinida', () => {
    const pressao = motivoIndisponibilidadeRegional('PRESSAO_HOSPITALAR_ESTIMADA');
    expect(pressao).toMatch(/região/);
    expect(pressao).not.toMatch(/município/);
    expect(motivoIndisponibilidadeRegional('VULNERABILIDADE')).toMatch(/IPVS/);
    expect(motivoIndisponibilidadeRegional('TENDENCIA')).toMatch(/Metodologia ainda não definida/);
  });
});
