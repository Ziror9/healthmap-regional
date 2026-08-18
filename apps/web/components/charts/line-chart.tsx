/**
 * Grafico de linha simples em SVG puro - sem dependencia de biblioteca de
 * graficos (o volume de pontos e pequeno: no maximo uma competencia por
 * mes da base DEMO). Responsivo via viewBox. Tooltip nativo (<title>) em
 * cada ponto - acessivel via teclado/leitor de tela sem JS adicional.
 */
export interface PontoSerie {
  /** Rotulo do eixo X (ex.: "jan/2025"). */
  rotulo: string;
  valor: number;
  /** Identificador da competencia representada, se aplicavel - usado por quem consome o componente para localizar o ponto em destaque, nao pelo grafico em si. */
  competenciaId?: number;
}

const LARGURA = 600;
const ALTURA = 220;
const PADDING_ESQUERDA = 40;
const PADDING_DIREITA = 16;
const PADDING_TOPO = 16;
const PADDING_BASE = 28;

export function LineChart({
  pontos,
  formatarValor = (valor: number) => valor.toFixed(2),
  valorMinimo,
  valorMaximo,
  indiceDestacado,
}: {
  pontos: PontoSerie[];
  formatarValor?: (valor: number) => string;
  valorMinimo?: number;
  valorMaximo?: number;
  /** Indice do ponto correspondente a competencia atualmente selecionada (fora do historico completo) - recebe destaque visual para nao ser confundido com "a competencia da janela do grafico". */
  indiceDestacado?: number;
}) {
  if (pontos.length === 0) return null;

  const larguraUtil = LARGURA - PADDING_ESQUERDA - PADDING_DIREITA;
  const alturaUtil = ALTURA - PADDING_TOPO - PADDING_BASE;

  const valores = pontos.map((p) => p.valor);
  const minY = valorMinimo ?? Math.min(0, ...valores);
  const maxY = valorMaximo ?? Math.max(1, ...valores);
  const amplitude = maxY - minY || 1;

  const x = (indice: number): number =>
    pontos.length <= 1 ? PADDING_ESQUERDA + larguraUtil / 2 : PADDING_ESQUERDA + (indice / (pontos.length - 1)) * larguraUtil;
  const y = (valor: number): number => PADDING_TOPO + alturaUtil - ((valor - minY) / amplitude) * alturaUtil;

  const caminho = pontos.map((ponto, indice) => `${indice === 0 ? 'M' : 'L'} ${x(indice).toFixed(1)} ${y(ponto.valor).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} className="w-full" role="img" aria-label="Série temporal">
      {[0, 0.5, 1].map((fracao) => {
        const posY = PADDING_TOPO + alturaUtil * (1 - fracao);
        const valorLinha = minY + fracao * amplitude;
        return (
          <g key={fracao}>
            <line x1={PADDING_ESQUERDA} x2={LARGURA - PADDING_DIREITA} y1={posY} y2={posY} className="stroke-border" strokeWidth={1} />
            <text x={PADDING_ESQUERDA - 8} y={posY} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[9px]">
              {formatarValor(valorLinha)}
            </text>
          </g>
        );
      })}

      <path d={caminho} fill="none" className="stroke-primary" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

      {pontos.map((ponto, indice) => {
        const destacado = indice === indiceDestacado;
        return (
          <circle
            key={ponto.rotulo}
            cx={x(indice)}
            cy={y(ponto.valor)}
            r={destacado ? 6 : 4}
            className={destacado ? 'fill-accent stroke-surface' : 'fill-primary stroke-surface'}
            strokeWidth={2}
          >
            <title>{`${ponto.rotulo}: ${formatarValor(ponto.valor)}${destacado ? ' (competência selecionada)' : ''}`}</title>
          </circle>
        );
      })}

      {pontos.map((ponto, indice) => (
        <text key={ponto.rotulo} x={x(indice)} y={ALTURA - 8} textAnchor="middle" className="fill-muted-foreground text-[9px]">
          {ponto.rotulo}
        </text>
      ))}
    </svg>
  );
}
