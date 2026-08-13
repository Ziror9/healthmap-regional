/**
 * SEVERIDADE (docs/risk-methodology.md #2.3).
 *
 * Documentado: "Composto de permanencia media, proporcao de diarias de UTI
 * e letalidade hospitalar." Eixo: INTERNACAO. Natureza: OBSERVADO.
 *
 * LACUNA METODOLOGICA (nao inventada): os 3 sub-indicadores estao nomeados,
 * mas a documentacao NAO define como compo-los num unico valor de
 * severidade (sem pesos, sem formula de combinacao - diferente do indice
 * final do Radar, que tem um mecanismo explicito de pesos versionados via
 * RiskConfig/RiskConfigComponente; nao existe equivalente para os
 * sub-componentes de severidade). Inventar uma combinacao (ainda que com
 * pesos iguais) seria inventar um criterio clinico de severidade, que a
 * Fase 2 explicitamente proibe ("nao invente pesos ou criterios clinicos").
 *
 * Por isso SEVERIDADE fica estruturalmente pronta mas SEMPRE indisponivel
 * como RiskComponenteValor. Os 3 sub-indicadores SAO individualmente
 * computaveis e estao implementados/testados abaixo como funcoes puras,
 * para que a combinacao possa ser adicionada depois sem redesenhar nada -
 * so nao sao persistidos (nao ha coluna no schema para 3 sub-valores
 * separados, e criar uma so para isso seria adicionar estrutura sem uso
 * imediato).
 */
import type { ComponenteResultado } from '../types.js';

export function calcularSeveridade(): ComponenteResultado {
  return {
    componente: 'SEVERIDADE',
    disponivel: false,
    valorBruto: null,
    valorNormalizado: null,
    natureza: 'OBSERVADO',
    confiabilidade: 'BAIXA',
    motivoIndisponibilidade:
      'combinacao de permanencia media + proporcao de diarias de UTI + letalidade em um unico ' +
      'valor nao esta definida em docs/risk-methodology.md (sem pesos/formula de composicao)',
  };
}

/** Permanencia media = diasPermanencia total / internacoes. null se suprimido ou sem internacoes. */
export function calcularPermanenciaMedia(diasPermanencia: number | null, internacoes: number | null): number | null {
  if (diasPermanencia === null || internacoes === null) return null;
  if (internacoes <= 0) return null;
  return diasPermanencia / internacoes;
}

/** Proporcao de diarias de UTI sobre o total de pacientes-dia. null se suprimido ou sem pacientes-dia. */
export function calcularProporcaoDiariasUti(diariasUti: number | null, pacientesDia: number | null): number | null {
  if (diariasUti === null || pacientesDia === null) return null;
  if (pacientesDia <= 0) return null;
  return diariasUti / pacientesDia;
}

/** Letalidade hospitalar = obitos / internacoes. null se suprimido ou sem internacoes. */
export function calcularLetalidade(obitos: number | null, internacoes: number | null): number | null {
  if (obitos === null || internacoes === null) return null;
  if (internacoes <= 0) return null;
  return obitos / internacoes;
}
