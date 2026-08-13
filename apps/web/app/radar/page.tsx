'use client';

import type { RiskScoreItemDTO } from '@healthmap/contracts';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ApiRequestError, fetchApi } from '@/lib/api';

/**
 * Pagina TECNICA de validacao da Fase 3 - prova que o frontend consegue
 * consumir a API real (GET /api/risk) e exibir dados com proveniencia
 * explicita. NAO e o dashboard final (isso e Fase 4): sem mapa, sem
 * filtros, sem design definitivo - so a prova de que a integracao funciona.
 *
 * Nunca calcula nada aqui: indice/classificacao/confiabilidade vem prontos
 * da API, que por sua vez so le RiskScore ja materializado pela Fase 2.
 */

interface RiskListMeta {
  filtros: { competenciaId: number; riskConfigId: number | null; origem: string | null };
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

interface RiskListResponse {
  data: RiskScoreItemDTO[];
  meta: RiskListMeta;
}

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'pronto'; resposta: RiskListResponse };

export default function RadarPage() {
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });

  useEffect(() => {
    let cancelado = false;

    async function carregar(): Promise<void> {
      setEstado({ tipo: 'carregando' });
      try {
        const resposta = await fetchApi<RiskListResponse>('/api/risk?pageSize=20');
        if (!cancelado) setEstado({ tipo: 'pronto', resposta });
      } catch (error) {
        if (cancelado) return;
        const mensagem =
          error instanceof ApiRequestError
            ? `${error.message} (HTTP ${error.status}${error.code ? `, ${error.code}` : ''})`
            : error instanceof Error
              ? error.message
              : 'Falha desconhecida ao consultar a API.';
        setEstado({ tipo: 'erro', mensagem });
      }
    }

    void carregar();
    return () => {
      cancelado = true;
    };
  }, []);

  return (
    <main className="container flex min-h-screen flex-col py-16">
      <div className="max-w-3xl">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">Validacao tecnica</Badge>
          <Badge variant="outline">Fase 3 &middot; API</Badge>
        </div>
        <h1 className="mt-8 text-3xl font-semibold tracking-tight sm:text-4xl">Radar de Risco</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Esta tela consome <code className="font-mono">GET /api/risk</code> direto da API. Nao e o
          dashboard final (Fase 4) - existe apenas para provar que apps/web consegue ler dados reais
          do banco, atraves da API, sem acessar o Prisma diretamente.
        </p>
      </div>

      <div className="mt-10">
        {estado.tipo === 'carregando' && <EstadoCarregando />}
        {estado.tipo === 'erro' && <EstadoErro mensagem={estado.mensagem} />}
        {estado.tipo === 'pronto' && <EstadoPronto resposta={estado.resposta} />}
      </div>
    </main>
  );
}

function EstadoCarregando() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      Carregando dados da API...
    </div>
  );
}

function EstadoErro({ mensagem }: { mensagem: string }) {
  return (
    <Card className="border-destructive/50">
      <CardContent className="flex items-start gap-3 pt-5">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
        <div>
          <p className="text-sm font-medium">Nao foi possivel carregar o Radar de Risco.</p>
          <p className="mt-1 text-sm text-muted-foreground">{mensagem}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function EstadoPronto({ resposta }: { resposta: RiskListResponse }) {
  if (resposta.data.length === 0) {
    return (
      <Card>
        <CardContent className="pt-5">
          <p className="text-sm text-muted-foreground">
            Nenhum RiskScore disponivel para os filtros resolvidos (competencia{' '}
            {resposta.meta.filtros.competenciaId}, riskConfig {resposta.meta.filtros.riskConfigId ?? '—'}).
            Isso e uma resposta coerente, nao um erro: pode significar que o calculo de risco (Fase 2)
            ainda nao rodou para essa combinacao.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Competencia {resposta.meta.filtros.competenciaId} &middot; RiskConfig{' '}
        {resposta.meta.filtros.riskConfigId ?? '—'} &middot; {resposta.meta.pagination.total} municipio(s)
      </p>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Municipio</th>
              <th className="px-4 py-3 font-medium">Indice</th>
              <th className="px-4 py-3 font-medium">Classificacao</th>
              <th className="px-4 py-3 font-medium">Confiabilidade</th>
              <th className="px-4 py-3 font-medium">Proveniencia</th>
            </tr>
          </thead>
          <tbody>
            {resposta.data.map((item) => (
              <tr key={`${item.municipio.id}-${item.riskConfigId}`} className="border-t border-border">
                <td className="px-4 py-3">
                  <div className="font-medium">{item.municipio.nome}</div>
                  <div className="font-mono text-xs text-muted-foreground">{item.municipio.codigoIbge7}</div>
                </td>
                <td className="px-4 py-3 font-mono">{item.indice.toFixed(4)}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline">{item.classificacao}</Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{item.confiabilidade}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <Badge variant={item.origem === 'DEMO' ? 'accent' : 'muted'}>{item.origem}</Badge>
                    <Badge variant="muted">{item.natureza}</Badge>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="border-l-2 border-border pl-4 font-mono text-xs leading-relaxed text-muted-foreground">
        Indice analitico e experimental (Radar de Risco Regional). Nao e diagnostico clinico nem
        avaliacao de qualidade assistencial. {resposta.meta.filtros.origem === 'DEMO'
          ? 'Todos os valores acima sao dados DEMO (sinteticos) - nao representam a situacao real de nenhum municipio.'
          : ''}
      </p>
    </div>
  );
}
