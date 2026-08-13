/**
 * Composicao do indice, classificacao e normalizacao em coorte.
 * docs/risk-methodology.md #3 (normalizacao), #4 (composicao/classificacao).
 */
import { normalizarPercentilCoorte, type ItemCoorte } from './normalization.js';
import type {
  ChaveCoorte,
  ClassificacaoRisco,
  ComponenteConfig,
  ComponenteResultado,
  ComponenteRisco,
  Confiabilidade,
  Direcao,
  Natureza,
  RiskConfigInput,
  RiskScoreResultado,
} from './types.js';

/**
 * Direcao intrinseca de cada componente do Radar - NAO e o mesmo conceito
 * de IndicadorDirecao (configuravel via IndicadorDefinicao, usado para
 * indicadores plugaveis como VULNERABILIDADE ou a taxa por 10k de
 * TENDENCIA). PRESSAO_HOSPITALAR_ESTIMADA e SEVERIDADE tem formula fixa
 * definida em risk-methodology.md, e "maior valor = maior risco" e
 * inerente ao que essas grandezas significam (mais pressao/mais gravidade),
 * nao uma escolha metodologica separada sujeita a configuracao. TENDENCIA
 * fica sempre indisponivel nesta fase (ver components/tendencia.ts), entao
 * sua entrada aqui e apenas para completude do mapa.
 */
const DIRECAO_INTRINSECA: Record<'PRESSAO_HOSPITALAR_ESTIMADA' | 'TENDENCIA' | 'SEVERIDADE', Direcao> = {
  PRESSAO_HOSPITALAR_ESTIMADA: 'MAIOR_PIOR',
  TENDENCIA: 'MAIOR_PIOR',
  SEVERIDADE: 'MAIOR_PIOR',
};

/**
 * Normaliza, por competencia e por componente, os valores brutos de todos
 * os municipios da coorte (docs/risk-methodology.md #3). Recebe o mapa
 * municipio -> resultados (ja calculados por calcularPressaoHospitalarEstimada
 * etc.) e devolve os MESMOS objetos com `valorNormalizado` preenchido -
 * apenas para os componentes com disponivel = true. VULNERABILIDADE usa a
 * direcao vinda de IndicadorDefinicao (recebida por parametro), nao a
 * DIRECAO_INTRINSECA.
 */
export function normalizarComponentesNaCoorte(
  resultadosPorMunicipio: Map<number, ComponenteResultado[]>,
  direcaoVulnerabilidade: Direcao,
): Map<number, ComponenteResultado[]> {
  const porComponente = new Map<ComponenteRisco, ItemCoorte<number>[]>();

  for (const [municipioId, resultados] of resultadosPorMunicipio) {
    for (const r of resultados) {
      if (!r.disponivel || r.valorBruto === null) continue;
      const lista = porComponente.get(r.componente) ?? [];
      lista.push({ chave: municipioId, valor: r.valorBruto });
      porComponente.set(r.componente, lista);
    }
  }

  const percentisPorComponente = new Map<ComponenteRisco, Map<number, number>>();
  for (const [componente, itens] of porComponente) {
    const direcao: Direcao =
      componente === 'VULNERABILIDADE' ? direcaoVulnerabilidade : DIRECAO_INTRINSECA[componente];
    percentisPorComponente.set(componente, normalizarPercentilCoorte(itens, direcao));
  }

  for (const [municipioId, resultados] of resultadosPorMunicipio) {
    for (const r of resultados) {
      if (!r.disponivel) continue;
      const percentil = percentisPorComponente.get(r.componente)?.get(municipioId);
      r.valorNormalizado = percentil ?? null;
    }
  }

  return resultadosPorMunicipio;
}

const RANKING_CONFIABILIDADE: Record<Confiabilidade, number> = { BAIXA: 0, MEDIA: 1, ALTA: 2 };

/**
 * Composicao ponderada (docs/risk-methodology.md #4): indice = soma
 * ponderada dos componentes normalizados, pesos de RiskConfig. Quando um
 * componente esta indisponivel, os pesos dos DEMAIS sao renormalizados
 * (mesma regra documentada explicitamente para VULNERABILIDADE em #2.4,
 * aplicada aqui de forma uniforme a qualquer componente ausente).
 *
 * confiabilidade e natureza do score agregado NAO tem regra definida em
 * docs/risk-methodology.md - decisoes de implementacao, documentadas aqui:
 *   - confiabilidade: a pior entre os componentes que efetivamente
 *     contribuiram peso ao indice (leitura conservadora - um indice nao e
 *     mais confiavel que seu elo mais fraco);
 *   - natureza: ESTIMATIVA se qualquer componente contribuinte for
 *     ESTIMATIVA (leitura conservadora - misturar OBSERVADO com ESTIMATIVA
 *     torna o composto, no minimo, parcialmente uma estimativa); OBSERVADO
 *     somente se TODOS os contribuintes forem OBSERVADO.
 */
export function calcularScore(
  resultadosNormalizados: readonly ComponenteResultado[],
  config: RiskConfigInput,
): RiskScoreResultado {
  const pesoPorComponente = new Map<ComponenteRisco, number>(
    config.componentes.map((c: ComponenteConfig) => [c.componente, c.peso]),
  );

  const contribuintes = resultadosNormalizados.filter(
    (r) => r.disponivel && r.valorNormalizado !== null && (pesoPorComponente.get(r.componente) ?? 0) > 0,
  );

  if (contribuintes.length === 0) {
    return {
      disponivel: false,
      indice: null,
      classificacao: null,
      confiabilidade: 'BAIXA',
      natureza: 'ESTIMATIVA',
      motivoIndisponibilidade: 'nenhum componente disponivel com peso configurado para esta RiskConfig',
    };
  }

  const somaPesos = contribuintes.reduce((acc, r) => acc + (pesoPorComponente.get(r.componente) ?? 0), 0);
  const indice = contribuintes.reduce((acc, r) => {
    const pesoRenormalizado = (pesoPorComponente.get(r.componente) ?? 0) / somaPesos;
    return acc + pesoRenormalizado * (r.valorNormalizado ?? 0);
  }, 0);

  const confiabilidade = contribuintes.reduce<Confiabilidade>(
    (pior, r) => (RANKING_CONFIABILIDADE[r.confiabilidade] < RANKING_CONFIABILIDADE[pior] ? r.confiabilidade : pior),
    'ALTA',
  );
  const natureza: Natureza = contribuintes.every((r) => r.natureza === 'OBSERVADO') ? 'OBSERVADO' : 'ESTIMATIVA';

  return { disponivel: true, indice, classificacao: null, confiabilidade, natureza };
}

/**
 * Classificacao em faixas (docs/risk-methodology.md #4): "O criterio de
 * corte das faixas ainda esta em aberto: quintis relativos da distribuicao
 * estadual da competencia, ou cortes absolutos fixos. Decisao necessaria
 * antes da Fase 2."
 *
 * LACUNA METODOLOGICA NAO RESOLVIDA PELO PROJETO: nenhuma das duas opcoes
 * foi formalmente escolhida nos documentos. Esta funcao implementa quintis
 * relativos da coorte porque e a unica das duas opcoes que nao exige
 * inventar numeros (cortes absolutos exigiriam escolher valores como 0.2/
 * 0.4/0.6/0.8 sem base documentada) e e a extensao mecanica mais direta da
 * normalizacao por percentil ja adotada. NAO esta confirmada como metodo
 * oficial - PROVISORIA, documentada como pendencia em
 * docs/known-limitations.md. Precisa de confirmacao explicita antes de
 * qualquer uso alem de demonstracao/desenvolvimento.
 */
const ORDEM_CLASSIFICACAO: ClassificacaoRisco[] = ['MUITO_BAIXO', 'BAIXO', 'MEDIO', 'ALTO', 'CRITICO'];

export function classificarPorQuintil(indicesPorMunicipio: ReadonlyMap<number, number>): Map<number, ClassificacaoRisco> {
  const itens: ItemCoorte<number>[] = [...indicesPorMunicipio.entries()].map(([municipioId, valor]) => ({
    chave: municipioId,
    valor,
  }));
  const percentis = normalizarPercentilCoorte(itens, 'MAIOR_PIOR');

  const resultado = new Map<number, ClassificacaoRisco>();
  for (const [municipioId, percentil] of percentis) {
    const indiceFaixa = Math.min(4, Math.floor(percentil * 5));
    resultado.set(municipioId, ORDEM_CLASSIFICACAO[indiceFaixa]!);
  }
  return resultado;
}

export type { ChaveCoorte };
