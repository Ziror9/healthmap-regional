import type { RiscoDoMunicipioDTO } from '@healthmap/contracts';
import { Card } from '@/components/ui/card';
import { formatCompetenciaLabel, formatIndice } from '@/lib/format';
import { ConfidenceBadge } from './confidence-badge';
import { FreshnessIndicator } from './freshness-indicator';
import { NatureBadge } from './nature-badge';
import { ProvenanceBadge } from './provenance-badge';
import { RiskBadge } from './risk-badge';

/** Painel principal do RiskScore de um municipio - indice, classificacao e toda a proveniencia junta (Origem/Natureza/Confiabilidade/Competencia/Frescor). */
export function RiskScorePanel({ risco }: { risco: RiscoDoMunicipioDTO }) {
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Índice do Radar</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight text-foreground">{formatIndice(risco.indice)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">escala 0–1 · configuração #{risco.riskConfigId}</p>
        </div>
        <RiskBadge classificacao={risco.classificacao} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <ConfidenceBadge confiabilidade={risco.confiabilidade} />
        <NatureBadge natureza={risco.natureza} />
        <ProvenanceBadge origem={risco.origem} />
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <FreshnessIndicator
          competenciaLabel={formatCompetenciaLabel(risco.competencia.ano, risco.competencia.mes)}
          calculadoEm={risco.calculadoEm}
        />
      </div>
    </Card>
  );
}
