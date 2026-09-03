import { AlertTriangle } from 'lucide-react';
import { StatusMetodologicoBadge } from '@/components/domain/status-metodologico';
import { PageContent } from '@/components/layout/page-content';
import { PageHeader } from '@/components/layout/page-header';
import { SectionHeader } from '@/components/layout/section-header';
import { Card } from '@/components/ui/card';

/**
 * Pagina estatica - conteudo transcrito fielmente de docs/risk-methodology.md,
 * docs/data-model.md e docs/known-limitations.md. Nada aqui e inventado; onde
 * a metodologia nao esta definida, a pagina diz isso explicitamente em vez de
 * omitir ou disfarçar.
 */

const COMPONENTES = [
  {
    nome: 'Pressão Hospitalar Estimada',
    status: 'IMPLEMENTADO' as const,
    formula: 'pacientes-dia / (leitos SUS × dias do mês)',
    eixo: 'Município de internação',
    natureza: 'Estimativa (sempre)',
    descricao:
      'O SIH/SUS não informa taxa de ocupação hospitalar — apenas internações e permanência. Por isso o produto usa sempre o termo "Pressão Hospitalar Estimada", nunca "ocupação". Fica indisponível quando qualquer célula contribuinte está suprimida (n < 5) ou quando não há leitos SUS registrados.',
    limitacao:
      'O denominador usa o total de leitos SUS do município (todos os tipos), não um subconjunto "oncológico" — o schema ainda não segrega capacidade por especialidade.',
  },
  {
    nome: 'Tendência',
    status: 'PROVISORIO' as const,
    formula: 'Variação da taxa de internação por 10.000 habitantes em janela móvel',
    eixo: 'Município de residência',
    natureza: 'Observado (quando calculável)',
    descricao:
      'A metodologia nomeia o indicador, mas nunca definiu o tamanho da janela móvel nem o método de tratamento de sazonalidade — dois parâmetros necessários para calcular uma "variação". Implementar um dos dois por conta própria seria inventar metodologia.',
    limitacao:
      'Fica sempre indisponível no Radar. O que é computável e foi implementado como indicador municipal simples: a taxa bruta de internação por 10.000 habitantes (sem a variação), disponível na aba de indicadores do município.',
  },
  {
    nome: 'Severidade',
    status: 'PROVISORIO' as const,
    formula: 'Composto de permanência média, proporção de diárias de UTI e letalidade hospitalar',
    eixo: 'Município de internação',
    natureza: 'Observado (quando calculável)',
    descricao:
      'Os 3 sub-indicadores estão implementados e testados individualmente, mas a metodologia nunca definiu pesos nem fórmula para combiná-los num único valor de severidade — diferente do índice final do Radar, que tem pesos versionados explícitos.',
    limitacao:
      'Fica sempre indisponível no Radar. Letalidade mais alta em municípios-polo pode refletir a complexidade dos casos recebidos, não pior desempenho assistencial — o indicador mede pressão assistencial, não qualidade.',
  },
  {
    nome: 'Vulnerabilidade',
    status: 'NAO_DEFINIDO' as const,
    formula: 'Indicador socioeconômico plugável (fonte a definir)',
    eixo: 'A definir junto da fonte',
    natureza: 'A definir junto da fonte',
    descricao:
      'A fonte do indicador de vulnerabilidade social ainda não foi definida — decisão adiada desde a concepção do produto. A arquitetura já acomoda a definição posterior sem exigir migração de schema.',
    limitacao:
      'Enquanto não existir, o índice final é calculado com os pesos renormalizados sobre os componentes disponíveis, e a ausência é registrada e exibida — o produto nunca finge que a vulnerabilidade existe.',
  },
];

export default function MetodologiaPage() {
  return (
    <>
      <PageHeader
        title="Metodologia"
        description="Como o Radar de Risco Regional é calculado — o que está implementado, o que é provisório e o que ainda não foi definido."
      />
      <PageContent className="max-w-4xl space-y-10">
        <Card className="flex items-start gap-3 border-warning/30 bg-warning/5 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
          <p className="text-sm leading-relaxed text-foreground">
            O Radar de Risco Regional é um <strong>índice analítico e experimental</strong>. Não é diagnóstico
            médico, risco clínico individual, nem avaliação de qualidade assistencial de qualquer hospital. Ele
            ordena municípios segundo a atenção que merecem do gestor público — nada além disso.
          </p>
        </Card>

        <section>
          <SectionHeader
            title="Proveniência: Origem e Natureza"
            description="Todo número do HealthMap carrega dois eixos independentes de proveniência."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="p-4">
              <p className="text-sm font-semibold text-foreground">Origem</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                <strong className="text-foreground">DEMO</strong> — dado sintético, gerado para desenvolvimento e
                demonstração. <strong className="text-foreground">REAL</strong> — derivado de fonte oficial
                (SIH/SUS, SIM, CNES, IBGE, SEADE), por pipeline de ingestão registrado. As análises do produto
                usam REAL; a base DEMO permanece apenas como apoio de desenvolvimento e testes.
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-sm font-semibold text-foreground">Natureza</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                <strong className="text-foreground">Observado</strong> — medido diretamente.{' '}
                <strong className="text-foreground">Estimativa</strong> — derivado por cálculo com premissas.{' '}
                <strong className="text-foreground">Projeção</strong> — valor futuro por método estatístico
                (ainda não implementado, ver Fase 7 no roadmap).
              </p>
            </Card>
          </div>
        </section>

        <section>
          <SectionHeader
            title="Componentes do Radar"
            description="O índice final é a soma ponderada dos 4 componentes previstos, com renormalização quando algum está indisponível."
          />
          <div className="space-y-3">
            {COMPONENTES.map((componente) => (
              <Card key={componente.nome} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{componente.nome}</p>
                  <StatusMetodologicoBadge status={componente.status} />
                </div>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{componente.formula}</p>
                <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                  <div className="flex gap-1.5">
                    <dt className="text-muted-foreground">Eixo:</dt>
                    <dd className="text-foreground">{componente.eixo}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-muted-foreground">Natureza:</dt>
                    <dd className="text-foreground">{componente.natureza}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{componente.descricao}</p>
                <p className="mt-2 border-l-2 border-border pl-3 text-xs leading-relaxed text-muted-foreground">
                  {componente.limitacao}
                </p>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <SectionHeader title="Normalização, composição e classificação" />
          <div className="space-y-3">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Normalização por percentil</p>
                <StatusMetodologicoBadge status="IMPLEMENTADO" />
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Cada componente é normalizado por percentil dentro da coorte (municípios de SP na mesma
                competência) — evita que a capital, um outlier estrutural de volume, comprima todos os demais
                municípios contra o zero.
              </p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Composição ponderada</p>
                <StatusMetodologicoBadge status="IMPLEMENTADO" />
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Índice = soma ponderada dos componentes normalizados, com pesos vindos de uma configuração
                versionada (RiskConfig). Quando um componente está indisponível, os pesos dos demais são
                renormalizados — nunca um valor inventado no lugar.
              </p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Classificação em 5 faixas (quintis)</p>
                <StatusMetodologicoBadge status="PROVISORIO" />
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                A metodologia sempre deixou em aberto se o corte das faixas (Crítico…Muito baixo) deveria usar
                quintis relativos da distribuição ou cortes absolutos fixos. Quintis relativos foram implementados
                por não exigirem inventar números de corte — mas essa escolha nunca foi formalmente confirmada
                como método oficial.
              </p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Confiabilidade por volume</p>
                <StatusMetodologicoBadge status="PROVISORIO" />
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Municípios com volume abaixo de um limiar configurável recebem confiabilidade <strong>Baixa</strong>.
                A metodologia define apenas esse corte — não existe um segundo limiar para distinguir{' '}
                <strong>Alta</strong> de <strong>Média</strong>, por isso a confiabilidade nunca aparece como
                Média nesta versão do produto.
              </p>
            </Card>
          </div>
        </section>

        <section>
          <SectionHeader
            title="Pesos: configuráveis, versionados, nunca oficiais por padrão"
          />
          <Card className="p-4">
            <ul className="list-inside list-disc space-y-1.5 text-xs leading-relaxed text-muted-foreground">
              <li>Nenhum peso é oficial até ser calibrado e validado — toda configuração nasce marcada como não oficial.</li>
              <li>Os pesos vivem em banco, nunca embutidos em código.</li>
              <li>Recalcular com uma configuração nova cria um registro novo — nunca sobrescreve o histórico.</li>
              <li>A interface sempre indica qual configuração produziu o índice exibido (rótulo &quot;configuração #N&quot;).</li>
            </ul>
          </Card>
        </section>

        <section>
          <SectionHeader title="Supressão de células pequenas" />
          <Card className="p-4">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Células com contagem de casos abaixo de um limiar (<strong className="text-foreground">n &lt; 5</strong>)
              nunca são exibidas com seu valor real — são marcadas como suprimidas, e todas as medidas numéricas
              daquela célula ficam indisponíveis. Um componente ou indicador que dependa de uma célula suprimida
              fica <strong className="text-foreground">indisponível por inteiro</strong>, nunca uma soma parcial
              das partes visíveis — isso evitaria a regra de supressão silenciosamente. O HealthMap nunca troca
              um valor suprimido por zero.
            </p>
          </Card>
        </section>

        <section>
          <SectionHeader title="Limitações conhecidas" description="Resumo — detalhes completos em docs/known-limitations.md." />
          <Card className="p-4">
            <ul className="list-inside list-disc space-y-1.5 text-xs leading-relaxed text-muted-foreground">
              <li>
                Tendência e Severidade continuam estruturalmente indisponíveis — a metodologia (janela móvel,
                sazonalidade, composição dos sub-indicadores) nunca foi definida, e não foi inventada.
              </li>
              <li>
                A taxa de internação por 10 mil habitantes tem cobertura de 1 município: a supressão n&lt;5
                aplicada célula a célula (faixa etária × sexo × competência) anula o total anual de quase todos
                os municípios. É a regra de privacidade funcionando, não uma falha de carga.
              </li>
              <li>
                O fluxo assistencial cobre ~94% do volume, mas 51,7% dos pares origem→destino ficam suprimidos
                (n&lt;5); pares com ponta fora de SP são excluídos, nunca imputados.
              </li>
              <li>As taxonomias de faixa etária (decenal) e tipo de leito são provisórias, não confrontadas com o padrão real do SIH/CNES.</li>
              <li>Os pesos do Radar são iguais (0,25) e não calibrados — nenhuma RiskConfig é oficial.</li>
              <li>A API é pública, sem autenticação — RBAC efetivo pertence à Fase 6.</li>
            </ul>
          </Card>
        </section>
      </PageContent>
    </>
  );
}
