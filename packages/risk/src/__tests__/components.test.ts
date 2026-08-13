import { describe, expect, it } from 'vitest';
import { calcularPressaoHospitalarEstimada } from '../components/pressaoHospitalar.js';
import { calcularTendencia, calcularTaxaPor10k } from '../components/tendencia.js';
import {
  calcularSeveridade,
  calcularPermanenciaMedia,
  calcularProporcaoDiariasUti,
  calcularLetalidade,
} from '../components/severidade.js';
import { calcularVulnerabilidade } from '../components/vulnerabilidade.js';

describe('calcularPressaoHospitalarEstimada', () => {
  it('calcula corretamente com entradas validas', () => {
    const r = calcularPressaoHospitalarEstimada({
      pacientesDia: 620,
      leitosSusTotal: 20,
      diasNoMes: 31,
      internacoesTotal: 50,
      limiarVolumeMinimo: 30,
    });
    expect(r.disponivel).toBe(true);
    expect(r.valorBruto).toBeCloseTo(620 / (20 * 31));
    expect(r.natureza).toBe('ESTIMATIVA');
    expect(r.confiabilidade).toBe('ALTA');
  });

  it('pacientesDia null (suprimido) -> indisponivel, nunca tratado como 0', () => {
    const r = calcularPressaoHospitalarEstimada({
      pacientesDia: null,
      leitosSusTotal: 20,
      diasNoMes: 31,
      internacoesTotal: 50,
      limiarVolumeMinimo: 30,
    });
    expect(r.disponivel).toBe(false);
    expect(r.valorBruto).toBeNull();
    expect(r.motivoIndisponibilidade).toMatch(/suprimida/);
  });

  it('leitosSusTotal null -> indisponivel', () => {
    const r = calcularPressaoHospitalarEstimada({
      pacientesDia: 100,
      leitosSusTotal: null,
      diasNoMes: 31,
      internacoesTotal: 50,
      limiarVolumeMinimo: 30,
    });
    expect(r.disponivel).toBe(false);
  });

  it('leitos-dia = 0 -> indisponivel (nao divide por zero)', () => {
    const r = calcularPressaoHospitalarEstimada({
      pacientesDia: 100,
      leitosSusTotal: 0,
      diasNoMes: 31,
      internacoesTotal: 50,
      limiarVolumeMinimo: 30,
    });
    expect(r.disponivel).toBe(false);
    expect(r.motivoIndisponibilidade).toMatch(/zero/);
  });

  it('volume abaixo do limiar -> confiabilidade BAIXA mesmo com valor disponivel', () => {
    const r = calcularPressaoHospitalarEstimada({
      pacientesDia: 100,
      leitosSusTotal: 20,
      diasNoMes: 31,
      internacoesTotal: 5,
      limiarVolumeMinimo: 30,
    });
    expect(r.disponivel).toBe(true);
    expect(r.confiabilidade).toBe('BAIXA');
  });
});

describe('calcularTendencia', () => {
  it('sempre indisponivel - janela movel e sazonalidade nao definidas na metodologia', () => {
    const r = calcularTendencia();
    expect(r.disponivel).toBe(false);
    expect(r.valorBruto).toBeNull();
    expect(r.motivoIndisponibilidade).toBeTruthy();
  });
});

describe('calcularTaxaPor10k', () => {
  it('calcula a taxa corretamente', () => {
    expect(calcularTaxaPor10k(50, 100_000)).toBeCloseTo(5);
  });

  it('internacoes null (suprimido) -> null, nunca 0', () => {
    expect(calcularTaxaPor10k(null, 100_000)).toBeNull();
  });

  it('populacao inexistente/zero -> null', () => {
    expect(calcularTaxaPor10k(10, 0)).toBeNull();
  });
});

describe('calcularSeveridade', () => {
  it('sempre indisponivel - composicao dos 3 sub-indicadores nao esta definida', () => {
    const r = calcularSeveridade();
    expect(r.disponivel).toBe(false);
  });
});

describe('sub-indicadores de severidade (computaveis individualmente)', () => {
  it('permanencia media calcula corretamente', () => {
    expect(calcularPermanenciaMedia(100, 20)).toBe(5);
  });
  it('permanencia media com entrada suprimida -> null', () => {
    expect(calcularPermanenciaMedia(null, 20)).toBeNull();
    expect(calcularPermanenciaMedia(100, null)).toBeNull();
  });
  it('permanencia media com internacoes = 0 -> null (nao divide por zero)', () => {
    expect(calcularPermanenciaMedia(0, 0)).toBeNull();
  });

  it('proporcao de diarias UTI calcula corretamente', () => {
    expect(calcularProporcaoDiariasUti(30, 100)).toBeCloseTo(0.3);
  });
  it('proporcao de diarias UTI com entrada ausente -> null', () => {
    expect(calcularProporcaoDiariasUti(null, 100)).toBeNull();
  });

  it('letalidade calcula corretamente', () => {
    expect(calcularLetalidade(2, 40)).toBeCloseTo(0.05);
  });
  it('letalidade com internacoes = 0 -> null', () => {
    expect(calcularLetalidade(0, 0)).toBeNull();
  });
});

describe('calcularVulnerabilidade', () => {
  it('indisponivel quando nenhuma fonte esta configurada (comportamento documentado, nao uma falha)', () => {
    const r = calcularVulnerabilidade({
      valorIndicador: null,
      naturezaIndicador: 'ESTIMATIVA',
      volume: 100,
      limiarVolumeMinimo: 30,
    });
    expect(r.disponivel).toBe(false);
    expect(r.motivoIndisponibilidade).toMatch(/fonte/);
  });

  it('disponivel quando um indicador ja resolvido e fornecido (arquitetura plugavel)', () => {
    const r = calcularVulnerabilidade({
      valorIndicador: 0.42,
      naturezaIndicador: 'OBSERVADO',
      volume: 100,
      limiarVolumeMinimo: 30,
    });
    expect(r.disponivel).toBe(true);
    expect(r.valorBruto).toBe(0.42);
    expect(r.natureza).toBe('OBSERVADO');
  });
});
