import { Activity, Database, Layers, ServerCog } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Pagina de status da Fase 0.
 *
 * Nao e o dashboard. Existe para confirmar que Next.js, Tailwind e os
 * componentes base estao funcionando, e para declarar em que estagio o projeto
 * esta. Sera substituida pelo dashboard na Fase 4.
 */

const componentes = [
  {
    icon: Layers,
    titulo: 'Monorepo',
    descricao: 'apps/web, apps/api e os packages compartilhados (db, risk, contracts).',
  },
  {
    icon: Database,
    titulo: 'PostgreSQL 16',
    descricao: 'Executando em container Docker, com volume persistente e healthcheck.',
  },
  {
    icon: ServerCog,
    titulo: 'API REST',
    descricao: 'Servico healthmap-api com liveness em /health e readiness em /health/ready.',
  },
  {
    icon: Activity,
    titulo: 'Radar de Risco',
    descricao: 'Package reservado. O algoritmo entra na Fase 2, com pesos versionados.',
  },
];

export default function Home() {
  return (
    <main className="container flex min-h-screen flex-col justify-center py-16">
      <div className="max-w-3xl">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">Ambiente de desenvolvimento</Badge>
          <Badge variant="outline">Fase 0 &middot; Fundacao</Badge>
        </div>

        <h1 className="mt-8 text-4xl font-semibold tracking-tight sm:text-5xl">
          HealthMap Regional
        </h1>

        <p className="mt-3 text-lg text-muted-foreground">
          Inteligencia analitica para saude regional
        </p>

        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          A fundacao tecnica esta montada. Ainda nao ha dashboard, indicadores, Radar de Risco nem
          qualquer dado carregado &mdash; a Fase 1 introduz o modelo de dados e a base DEMO.
        </p>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {componentes.map(({ icon: Icon, titulo, descricao }) => (
          <Card key={titulo}>
            <CardHeader>
              <Icon className="h-5 w-5 text-accent" aria-hidden />
              <CardTitle className="mt-2">{titulo}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>{descricao}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="mt-12 max-w-3xl border-l-2 border-border pl-4 font-mono text-xs leading-relaxed text-muted-foreground">
        Nenhum dado oficial do SIH/SUS, CNES ou IBGE foi integrado ate aqui. Quando dados existirem,
        cada numero exibido declarara sua origem (REAL ou DEMO) e sua natureza (OBSERVADO,
        ESTIMATIVA ou PROJECAO).
      </p>
    </main>
  );
}
