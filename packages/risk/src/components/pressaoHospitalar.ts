/**
 * PRESSAO_HOSPITALAR_ESTIMADA (docs/risk-methodology.md #2.1).
 *
 * Formula documentada, implementada exatamente:
 *
 *   pressao_estimada = pacientes-dia oncologicos / leitos-dia oncologicos SUS
 *
 * - pacientes-dia: soma da permanencia das internacoes na competencia
 *   (FatoInternacaoLocal.pacientesDia, eixo INTERNACAO).
 * - leitos-dia: leitos SUS x dias do mes (FatoCapacidadeLeitos.leitosSus x
 *   Competencia.diasNoMes).
 * - Natureza: sempre ESTIMATIVA (documentado explicitamente).
 * - Eixo: sempre INTERNACAO - nunca residencia.
 *
 * LACUNA DE DADOS (nao de formula, ja documentada na Fase 1 -
 * docs/known-limitations.md): a formula fala em leitos "oncologicos", mas o
 * schema nao tem capacidade de leitos segregada por habilitacao oncologica
 * (FatoCapacidadeLeitos e por tipoLeito, nao por especialidade). Este motor
 * usa o total de leitosSus do municipio (soma de todos os tipoLeito) como
 * denominador - a melhor aproximacao disponivel nos dados atuais, nao uma
 * escolha metodologica nova. Isso permanece registrado como pendencia.
 *
 * REGRA DE SUPRESSAO (ponto 16 do pedido - NULL != 0): pacientesDia
 * agregado por municipio+competencia so e considerado valido se NENHUMA das
 * celulas de faixa/sexo que o compoem estiver suprimida. Se qualquer celula
 * estiver suprimida, o total agregado e desconhecido (nao e a soma parcial
 * das celulas visiveis, que subestimaria silenciosamente o real) - o
 * componente fica indisponivel. Essa decisao de agregacao e responsabilidade
 * de quem monta o input (packages/db), nao deste modulo; a funcao abaixo so
 * recebe o resultado ja decidido via `pacientesDia: null`.
 */
import type { ComponenteResultado } from '../types.js';
import { calcularConfiabilidade } from '../reliability.js';

export interface PressaoHospitalarInput {
  /** null = agregado indisponivel (ver regra de supressao acima, ou ausencia de dado). */
  pacientesDia: number | null;
  /** Soma de leitosSus de todos os tipoLeito do municipio na competencia. null = sem dado. */
  leitosSusTotal: number | null;
  diasNoMes: number;
  /** Total de internacoes (eixo internacao) do municipio na competencia - usado como volume para confiabilidade. */
  internacoesTotal: number | null;
  limiarVolumeMinimo: number;
}

function indisponivel(motivo: string): ComponenteResultado {
  return {
    componente: 'PRESSAO_HOSPITALAR_ESTIMADA',
    disponivel: false,
    valorBruto: null,
    valorNormalizado: null,
    natureza: 'ESTIMATIVA',
    confiabilidade: 'BAIXA',
    motivoIndisponibilidade: motivo,
  };
}

export function calcularPressaoHospitalarEstimada(input: PressaoHospitalarInput): ComponenteResultado {
  if (input.pacientesDia === null) {
    return indisponivel('pacientesDia indisponivel: pelo menos uma celula contribuinte esta suprimida (n < 5)');
  }
  if (input.leitosSusTotal === null) {
    return indisponivel('leitosSusTotal indisponivel: sem dado de capacidade de leitos para a competencia');
  }
  const leitosDia = input.leitosSusTotal * input.diasNoMes;
  if (leitosDia <= 0) {
    return indisponivel('leitos-dia = 0: divisao por zero (municipio sem leitos SUS registrados)');
  }

  const valorBruto = input.pacientesDia / leitosDia;
  const confiabilidade = calcularConfiabilidade(input.internacoesTotal ?? 0, input.limiarVolumeMinimo);

  return {
    componente: 'PRESSAO_HOSPITALAR_ESTIMADA',
    disponivel: true,
    valorBruto,
    valorNormalizado: null,
    natureza: 'ESTIMATIVA',
    confiabilidade,
  };
}
