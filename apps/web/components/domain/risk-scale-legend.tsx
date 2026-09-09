import type { ClassificacaoRisco } from '@healthmap/contracts';
import { EscalaLegenda, type FaixaLegenda } from '@/components/charts/map-legend';
import { CLASSIFICACAO_ORDEM, getClassificacaoDisplay } from '@/lib/risk-display';

/**
 * Legenda da escala do Radar. Monta as 5 faixas e delega o desenho a
 * EscalaLegenda - a mesma usada pelo Radar Municipal, para que mapa, legenda e
 * chip nunca divirjam.
 *
 * `contagemPorClassificacao` e opcional: onde a pagina ja tem a lista
 * classificada em maos (Visao Geral), a legenda mostra quantos municipios
 * caem em cada faixa. Isso e contagem de itens ja classificados pela API -
 * nenhum limiar, corte ou classificacao acontece aqui.
 */
export function RiskScaleLegend({
  contagemPorClassificacao,
  semDado,
  className,
}: {
  contagemPorClassificacao?: Record<ClassificacaoRisco, number>;
  semDado?: { quantidade: number; motivo: string };
  className?: string;
}) {
  // Do menor para o maior nivel - CLASSIFICACAO_ORDEM vai do mais critico ao menos.
  const faixas: FaixaLegenda[] = [...CLASSIFICACAO_ORDEM].reverse().map((classificacao) => {
    const { label, nivel, swatchClass } = getClassificacaoDisplay(classificacao);
    return {
      chave: classificacao,
      label: `${label} (${nivel}/5)`,
      swatchClass,
      quantidade: contagemPorClassificacao?.[classificacao],
    };
  });

  return <EscalaLegenda faixas={faixas} semDado={semDado} className={className} />;
}
