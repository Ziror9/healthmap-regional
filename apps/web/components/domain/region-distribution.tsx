import type { ClassificacaoRisco } from '@healthmap/contracts';
import { Tooltip } from '@/components/ui/tooltip';
import { CLASSIFICACAO_ORDEM, getClassificacaoDisplay } from '@/lib/risk-display';
import { cn } from '@/lib/utils';

/**
 * Distribuicao dos indices municipais por Regiao de Saude.
 *
 * REDESIGN (E3): substitui o RegionHeatGrid, que desenhava UM QUADRADINHO POR
 * MUNICIPIO - 645 chips de 24px em 17 cartoes. Aquilo lia como campo de
 * pixels: para responder "qual DRS merece atencao" era preciso contar
 * quadradinhos a olho, e sozinho respondia por metade dos nos de DOM da
 * pagina. Cada regiao agora e uma barra empilhada com a distribuicao pelos 5
 * niveis, ordenada pela participacao de Critico+Alto - que e a pergunta que a
 * leitura regional existe para responder.
 *
 * ATENCAO - NAO CONFUNDIR COM O RADAR REGIONAL:
 * isto e AGRUPAMENTO dos indices MUNICIPAIS por DRS, calculado no navegador
 * sobre a lista que /api/risk ja devolveu. O Radar Regional (Fase 5.5,
 * `RiskScoreRegional` via /api/risk/regioes) e outro numero: um indice
 * calculado no grao regional, com supressao n<5 decidida de forma
 * independente sobre o dado bruto, nunca somando fatos municipais ja
 * suprimidos. Os dois coexistem e respondem coisas diferentes; a interface
 * precisa dizer qual esta na tela. Ver docs/known-limitations.md #6.
 */
export interface RegiaoGrupo {
  regiaoId: number;
  regiaoNome: string;
  municipios: { id: number; nome: string; classificacao: ClassificacaoRisco | null }[];
}

interface LinhaRegiao {
  grupo: RegiaoGrupo;
  contagem: Record<ClassificacaoRisco, number>;
  semIndice: number;
  criticosOuAltos: number;
  total: number;
  participacao: number;
}

function resumir(grupo: RegiaoGrupo): LinhaRegiao {
  const contagem: Record<ClassificacaoRisco, number> = { CRITICO: 0, ALTO: 0, MEDIO: 0, BAIXO: 0, MUITO_BAIXO: 0 };
  let semIndice = 0;
  for (const municipio of grupo.municipios) {
    if (municipio.classificacao) contagem[municipio.classificacao] += 1;
    else semIndice += 1;
  }
  const total = grupo.municipios.length;
  const criticosOuAltos = contagem.CRITICO + contagem.ALTO;
  return {
    grupo,
    contagem,
    semIndice,
    criticosOuAltos,
    total,
    participacao: total > 0 ? criticosOuAltos / total : 0,
  };
}

export function RegionDistribuicao({ grupos, className }: { grupos: RegiaoGrupo[]; className?: string }) {
  const linhas = grupos.map(resumir).sort((a, b) => b.participacao - a.participacao || b.total - a.total);

  return (
    <div className={cn('overflow-hidden rounded-md border border-border bg-surface', className)}>
      {linhas.map((linha) => (
        <div
          key={linha.grupo.regiaoId}
          className="flex flex-col gap-1.5 border-b border-border px-3 py-2.5 last:border-b-0 sm:flex-row sm:items-center sm:gap-4"
        >
          <p className="w-full min-w-0 truncate text-body font-medium text-foreground sm:w-44 sm:shrink-0">
            {linha.grupo.regiaoNome}
          </p>

          <div className="flex min-w-0 flex-1 overflow-hidden rounded-sm" role="img"
            aria-label={`${linha.grupo.regiaoNome}: ${CLASSIFICACAO_ORDEM.map(
              (c) => `${linha.contagem[c]} ${getClassificacaoDisplay(c).label}`,
            ).join(', ')}${linha.semIndice > 0 ? `, ${linha.semIndice} sem índice` : ''}`}
          >
            {[...CLASSIFICACAO_ORDEM].reverse().map((classificacao) => {
              const quantidade = linha.contagem[classificacao];
              if (quantidade === 0) return null;
              const display = getClassificacaoDisplay(classificacao);
              return (
                <Tooltip
                  key={classificacao}
                  label={`${quantidade} município(s) — ${display.label} (nível ${display.nivel}/5)`}
                  className="block"
                >
                  <span
                    className={cn('block h-4', display.swatchClass)}
                    style={{ width: `${(quantidade / linha.total) * 100}%`, minWidth: 3 }}
                  />
                </Tooltip>
              );
            })}
            {linha.semIndice > 0 && (
              <Tooltip label={`${linha.semIndice} município(s) sem índice nesta competência`} className="block">
                <span
                  className="block h-4 bg-unavailable-bg"
                  style={{ width: `${(linha.semIndice / linha.total) * 100}%`, minWidth: 3 }}
                />
              </Tooltip>
            )}
          </div>

          <p className="shrink-0 text-label text-muted-foreground sm:w-40 sm:text-right">
            <span className="tabular font-medium text-foreground">{linha.criticosOuAltos}</span> em atenção ·{' '}
            <span className="tabular">{linha.total}</span> municípios
          </p>
        </div>
      ))}
    </div>
  );
}
