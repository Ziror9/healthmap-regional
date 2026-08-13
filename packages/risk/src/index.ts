/**
 * @healthmap/risk
 *
 * Implementacao UNICA do Radar de Risco Regional.
 *
 * FASE 2: motor puro implementado. Recebe insumos estruturados (extraidos
 * dos dados gold por packages/db), devolve resultados deterministicos. Sem
 * acesso a banco, sem HTTP, sem formatacao - packages/db chama estas
 * funcoes e persiste o resultado.
 *
 * Conceito e metodologia: docs/risk-methodology.md
 * Estado da implementacao e lacunas metodologicas: docs/fase-2-relatorio.md
 *
 * Avisos que acompanham o indice em qualquer superficie do produto:
 *  - e um indice analitico e EXPERIMENTAL;
 *  - nao e diagnostico medico, risco clinico individual nem avaliacao de
 *    qualidade assistencial;
 *  - os pesos sao configuraveis e versionados (RiskConfig), e nenhum
 *    conjunto de pesos e oficial ate ser calibrado e validado;
 *  - a classificacao em faixas (CRITICO..MUITO_BAIXO) usa quintis da coorte
 *    como metodo PROVISORIO - a metodologia oficial ainda nao decidiu entre
 *    quintis relativos e cortes absolutos fixos (ver risk-methodology.md #4).
 */

export {
  COMPONENTES_PREVISTOS,
  type ChaveCoorte,
  type ClassificacaoRisco,
  type ComponenteConfig,
  type ComponenteResultado,
  type ComponenteRisco,
  type Confiabilidade,
  type Direcao,
  type Natureza,
  type Origem,
  type RiskConfigInput,
  type RiskScoreResultado,
} from './types.js';

export { normalizarPercentilCoorte, type ItemCoorte } from './normalization.js';
export { calcularConfiabilidade } from './reliability.js';

export {
  calcularPressaoHospitalarEstimada,
  type PressaoHospitalarInput,
} from './components/pressaoHospitalar.js';
export { calcularTendencia, calcularTaxaPor10k } from './components/tendencia.js';
export {
  calcularSeveridade,
  calcularPermanenciaMedia,
  calcularProporcaoDiariasUti,
  calcularLetalidade,
} from './components/severidade.js';
export {
  calcularVulnerabilidade,
  type VulnerabilidadeInput,
} from './components/vulnerabilidade.js';

export { normalizarComponentesNaCoorte, calcularScore, classificarPorQuintil } from './score.js';
