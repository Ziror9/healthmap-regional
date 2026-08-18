import { Activity, Database, Layers, ServerCog } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageContent } from '@/components/layout/page-content';
import { PageHeader } from '@/components/layout/page-header';

const COMPONENTES = [
  { icon: Layers, titulo: 'Monorepo', descricao: 'apps/web, apps/api e os packages compartilhados (contracts, db, risk).' },
  { icon: Database, titulo: 'PostgreSQL 16', descricao: 'Schemas silver/gold/meta, em container Docker com volume persistente.' },
  { icon: ServerCog, titulo: 'API REST', descricao: 'Catálogo geográfico e Radar de Risco, somente leitura, sem autenticação nesta fase.' },
  { icon: Activity, titulo: 'Radar de Risco', descricao: 'Motor único em packages/risk. Pressão Hospitalar Estimada calcula valor; os demais componentes ficam indisponíveis por lacuna metodológica documentada.' },
];

export default function SobrePage() {
  return (
    <>
      <PageHeader title="Sobre" description="O que é o HealthMap Regional e em que estágio o produto está." />
      <PageContent className="max-w-3xl space-y-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">Ambiente de desenvolvimento</Badge>
          <Badge variant="outline">Fase 5 · Dados REAL (parcial) + DEMO</Badge>
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">
          O HealthMap Regional é uma plataforma de inteligência analítica para saúde pública. Integra dados
          públicos do SIH/SUS, CNES e IBGE para monitorar internações hospitalares por município, com foco
          inicial em oncologia (neoplasias malignas, CID-10 C00-C97) no estado de São Paulo. Não é um sistema
          clínico nem transacional hospitalar — é um produto analítico de apoio à decisão de gestão, alimentado
          por dados públicos agregados.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {COMPONENTES.map(({ icon: Icon, titulo, descricao }) => (
            <Card key={titulo}>
              <CardHeader>
                <Icon className="h-5 w-5 text-primary" aria-hidden />
                <CardTitle className="mt-2">{titulo}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{descricao}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-3 border-l-2 border-border pl-4 text-xs leading-relaxed text-muted-foreground">
          <p>
            <strong className="text-foreground">O que já é REAL:</strong> os 645 municípios de São Paulo e suas
            17 regiões de saúde (IBGE + SES-SP), a malha territorial oficial (mapa), capacidade de leitos
            SUS/total via CNES, e uma prova de conceito do SIH/SUS (internações oncológicas, competência
            2024-02). Cada número REAL carrega proveniência completa e pode ser conferido junto do dado — nunca
            é apresentado como DEMO nem misturado silenciosamente com ele.
          </p>
          <p>
            <strong className="text-foreground">O que ainda é DEMO:</strong> os 15 municípios ilustrativos
            (código IBGE sintético, prefixo <code className="font-mono">36</code>) e, por enquanto, o próprio
            Radar de Risco inteiro — SIH e CNES REAL ainda não compartilham nenhuma competência em comum, então
            a Pressão Hospitalar Estimada REAL continua indisponível (motivo completo em{' '}
            <code className="font-mono">docs/sih-methodology.md</code> §9). Todo dado DEMO é sintético e
            declarado como tal na interface, nunca apresentado como se fosse oficial.
          </p>
          <p>
            Detalhes completos em <code className="font-mono">docs/fase-5-relatorio.md</code>,{' '}
            <code className="font-mono">docs/known-limitations.md</code> e na página de{' '}
            <Link href="/metodologia" className="text-primary hover:underline">
              Metodologia
            </Link>
            .
          </p>
        </div>
      </PageContent>
    </>
  );
}
