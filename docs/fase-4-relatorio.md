# Fase 4 — Relatório de Implementação

## 1. Objetivo

Transformar o HealthMap Regional num produto navegável de ponta a ponta sobre
a base DEMO, com identidade visual própria de plataforma enterprise de
inteligência territorial — não apenas tecnicamente funcional, mas
deliberadamente projetado: design system coerente antes das páginas,
hierarquia visual clara, proveniência sempre explícita (Origem, Natureza,
confiabilidade, supressão), e escala de risco legível sem depender só de
cor. Consumindo exclusivamente a API da Fase 3, sem acesso a banco, sem
recalcular índice/peso/classificação no frontend, sem inventar dado ou
metodologia.

## 2. Estado inicial (auditoria antes de implementar)

- **Fase 3 operacional**: 32/32 testes de integração passando, todos os
  endpoints (`/api/municipios`, `/api/regioes`, `/api/competencias`,
  `/api/indicadores`, `/api/risk*`) validados nesta sessão contra o
  PostgreSQL real.
- `apps/web` tinha só a página de status da Fase 0 e a página técnica
  `/radar` da Fase 3 — nenhum design system, tema forçado em modo escuro
  (`className="dark"` fixo no `<html>`), sem sidebar, sem navegação.
- `packages/contracts` já tinha os enums `Origem`/`Natureza`, mas não
  `ClassificacaoRisco`/`Confiabilidade`/`ComponenteRisco`/`IndicadorDirecao`
  — precisavam existir no lado HTTP para os componentes de badge.
- Nenhum GeoJSON de São Paulo, nenhuma coordenada (`latitude`/`longitude`)
  populada em `Municipio` — bloqueio real para o mapa pedido no roadmap,
  identificado antes de escrever qualquer código de mapa.
- Nenhuma dependência de gráfico ou mapa (`recharts`, `leaflet`) instalada.

Nenhum bloqueio impedia iniciar a Fase 4; o único ajuste necessário no
backend foi aditivo (seção 14, item 1).

## 3. Design System

Definido **antes** das páginas (`apps/web/app/globals.css` +
`apps/web/tailwind.config.ts`), substituindo o tema escuro forçado por um
tema claro único:

- **Estrutura**: `background` (fundo neutro), `surface`/`surface-muted`
  (superfícies), `border`, `foreground`/`muted-foreground` (texto).
- **Identidade**: `primary` (azul institucional profundo, uso reservado a
  ação/navegação ativa — nunca preenchimento de área grande), `accent`
  (teal, parcimonioso).
- **Semânticas**: `success`, `warning`, `danger`, `info` — reservadas a
  significado.
- **Escala de risco e proveniência**: não viraram tokens CSS — são um
  número fixo de categorias, sempre com ícone + texto + (para risco) nível
  numérico 1–5, mapeadas em `lib/risk-display.ts` (`getClassificacaoDisplay`,
  `getConfiabilidadeDisplay`, `getNaturezaDisplay`, `getOrigemDisplay`).
  Nenhuma dessas funções calcula nada — só traduz um valor que a API já
  devolveu pronto em rótulo/ícone/cor.
- Sem gradientes, sombras mínimas (só `shadow-sm`/`shadow-md` em elementos
  flutuantes — tooltip, drawer mobile), sem emoji.

## 4. Páginas implementadas

| Rota | Conteúdo |
|---|---|
| `/` | Visão Geral: KPIs, território por Região de Saúde (substituto do mapa), municípios em maior atenção |
| `/radar` | Ranking completo: ordenação por coluna, filtro por classificação, filtros globais (competência/origem) |
| `/municipios` | Catálogo paginado, busca por nome, filtro por região |
| `/municipios/[id]` | Drill-down: painel de risco, seletor de competência/config, componentes do Radar, série temporal, indicadores |
| `/metodologia` | Conteúdo fiel a `docs/risk-methodology.md`/`data-model.md`/`known-limitations.md`, com selo IMPLEMENTADO/PROVISÓRIO/NÃO DEFINIDO por componente |
| `/sobre` | Página estática sobre o projeto e o estágio atual |

Todas compartilham o shell (sidebar + `PageHeader` por página).

## 5. Componentes criados

**UI genéricos** (`components/ui/`): `button`, `table`, `select`,
`tooltip` (CSS puro, sem JS), `skeleton`; `badge`/`card` (Fase 0) estendidos.

**Domínio** (`components/domain/`): `RiskBadge` (classificação + ícone +
nível 1–5), `ConfidenceBadge`, `NatureBadge`, `ProvenanceBadge`,
`UnavailableNote` (indisponível/suprimido — nunca "0"), `FreshnessIndicator`
(competência + `calculadoEm` real), `KpiCard`, `RiskScaleLegend`,
`FilterBar` (competência + origem, via URL), `RiskScorePanel`,
`RegionHeatGrid`, `StatusMetodologicoBadge`.

**Layout** (`components/layout/`): `Sidebar` (responsiva — barra fixa em
desktop, drawer deslizante em mobile), `PageHeader`, `PageContent`,
`SectionHeader`.

**Gráfico** (`components/charts/`): `LineChart` — SVG próprio para série
temporal, sem dependência nova (tooltip nativo via `<title>`, responsivo via
`viewBox`).

**Estados** (`components/states/`): `LoadingState`, `EmptyState`,
`ErrorState` — usados em toda página que busca dado assíncrono.

## 6. Integração com a API

`apps/web/lib/api.ts` estende o cliente HTTP mínimo da Fase 3 com fetchers
tipados por recurso (`getMunicipios`, `getMunicipio`, `getRegioes`,
`getCompetencias`, `getIndicadores`, `getRisk`, `getRiskMunicipio`,
`getRiskComponentes`), todos usando os tipos de `@healthmap/contracts`.
Filtros globais (competência, origem) vivem na URL
(`lib/use-risk-filters.ts`, via `useSearchParams`/`router.push`) — visíveis,
compartilháveis, sobrevivem a refresh. Nenhum acesso a `@healthmap/db` nem
`@prisma/client` em nenhum arquivo de `apps/web` (verificado pelo teste de
fronteira já existente da Fase 3,
`apps/api/src/__tests__/architecture-boundaries.test.ts`, que varre
`apps/web` inteiro).

## 7. Proveniência

Todo item que representa um valor calculado carrega Origem, Natureza e (para
o índice) Confiabilidade como badges dedicados, nunca só cor:

- **DEMO**: badge violeta com rótulo "DEMO" e tooltip explicando que é dado
  sintético. Aparece em toda linha do ranking, no painel de risco do
  município e em cada indicador.
- **ESTIMATIVA/OBSERVADO/PROJEÇÃO**: `NatureBadge` com rótulo e cor
  distintos — nunca a mesma aparência.
- **Confiabilidade BAIXA**: `ConfidenceBadge` com ícone de alerta (`ShieldAlert`)
  e tooltip explicando a causa (volume abaixo do limiar).
- **Frescor**: `FreshnessIndicator` mostra a competência exibida e
  `calculadoEm` — timestamp real de `RiskScore.createdAt`, nunca fabricado
  (ver seção 14, item 1).

## 8. Tratamento de supressão

Um componente do Radar com `disponivel = false` nunca aparece como `0`,
`-` ou vazio: `UnavailableNote` mostra "Indisponível" mais o motivo real
(`lib/risk-display.ts`, `getMotivoIndisponibilidade`) — para
`TENDENCIA`/`SEVERIDADE`/`VULNERABILIDADE` o motivo é a lacuna metodológica
documentada; para `PRESSAO_HOSPITALAR_ESTIMADA`, supressão de células
pequenas ou ausência de capacidade de leitos. Validado ao vivo no navegador
com Campinas (`/municipios/4`): os 3 componentes indisponíveis mostram o
texto correto, e o disponível mostra o valor numérico normalmente.

## 9. Limitações

Resumo — detalhes completos em `docs/known-limitations.md` §9 e
`docs/roadmap.md` (Fase 4):

1. **Sem mapa geográfico.** Nenhum GeoJSON oficial de SP no repositório,
   nenhuma coordenada populada na base. Painel "Mapa geográfico indisponível
   nesta fase" explica o bloqueio; agrupamento por Região de Saúde
   (`RegionHeatGrid`) é o substituto prático, com dado real.
2. **Filtros restritos ao que a API suporta.** Sem sexo/faixa
   etária/município no Radar (a API não os expõe); sem seletor de
   RiskConfig (a API não lista configs disponíveis).
3. **KPIs de volume absoluto (internações, óbitos) não existem** — exigiriam
   endpoint agregando fato bruto, que a Fase 3 deliberadamente não criou.
4. **Sem testes automatizados de frontend** — validação por
   `typecheck`/`lint`/`build`/verificação manual no navegador (ver seção 10).
5. Todas as limitações herdadas de Fase 1/2/3 (geografia sintética,
   `TENDENCIA`/`SEVERIDADE`/`VULNERABILIDADE` sempre indisponíveis,
   classificação por quintil provisória, API pública sem autenticação)
   continuam valendo — o frontend só expõe o que já existia.

## 10. Testes

Não foram criados testes automatizados de `apps/web` nesta fase (não havia
tooling de teste de frontend no projeto). Validação executada:

- **Suíte completa do monorepo**: `npm run test` — **102/102 passando**
  (32 `apps/api` + 27 `packages/db` + 43 `packages/risk`), inalterados desde
  a Fase 3 exceto pelo campo novo `calculadoEm` (seção 14, item 1), coberto
  por uma asserção adicional em `apps/api/src/__tests__/risk.test.ts`.
- **Verificação manual no navegador** (via ferramenta de automação),
  cobrindo:
  - as 6 páginas carregando sem erro de console (checado em aba nova, sem
    cache de console de navegações anteriores);
  - filtro de competência/origem via URL (`?origem=REAL` → lista vazia
    coerente, `EmptyState` com mensagem explicativa);
  - drill-down `/municipios/4` (Campinas): painel de risco, 5 competências
    na série temporal, os 4 componentes do Radar (1 disponível com valor
    numérico, 3 indisponíveis com motivo correto), troca de competência/config
    via seletor (novo fetch de componentes confirmado por valor diferente);
  - município sem `RiskScore` (`/municipios/2`, Guarulhos): `EmptyState`
    "Nenhum RiskScore calculado", sem quebra;
  - município inexistente (`/municipios/999999`): estado "não encontrado";
  - responsividade: sem overflow horizontal em desktop (1280px), tablet
    (768px) e mobile (375px) nas páginas `/`, `/radar`, `/municipios/[id]`,
    `/metodologia` — um bug real de overflow foi encontrado e corrigido
    durante essa verificação (seção 14, item 3).

## 11. Typecheck

`npm run typecheck` (raiz, todos os workspaces) — sem erros, incluindo
`@healthmap/web` com os tipos novos de `@healthmap/contracts`.

## 12. Lint

`npm run lint` (raiz) — sem erros. Um erro foi encontrado e corrigido durante
o desenvolvimento (comentário `eslint-disable` referenciando uma regra
(`react-hooks/exhaustive-deps`) não configurada neste projeto — removido).

## 13. Build

`npm run build` (raiz) — `@healthmap/api` (tsup) e `@healthmap/web`
(`next build`, produção) compilam com sucesso, 8 rotas geradas (7 estáticas
+ 1 dinâmica, `/municipios/[id]`). Nenhum erro de Suspense boundary
(`useSearchParams`) graças ao `<Suspense>` explícito nas páginas que usam
filtros via URL (`/` e `/radar`).

## 14. Decisões importantes

1. **`RiskScoreItemDTO` ganhou o campo `calculadoEm`** (`RiskScore.createdAt`,
   já existente no schema desde a Fase 1, nunca antes exposto pela API).
   Necessário para o "indicador de frescor", item obrigatório da Fase 4. A
   alternativa seria fabricar um timestamp no frontend — proibido
   explicitamente ("não inventar dados"). Mudança aditiva em
   `packages/contracts/src/risk.ts`, `packages/db/src/repositories/riskQuery.ts`
   e `apps/api/src/services/risk.service.ts`; testes de integração
   atualizados (não quebrados).
2. **Bug pré-existente descoberto e corrigido**: o webpack do Next.js não
   resolvia os imports relativos com extensão `.js` de
   `packages/contracts/src/index.ts` (convenção NodeNext do tsconfig raiz)
   quando havia um import de **valor** em runtime — até a Fase 4, todo
   consumo de `@healthmap/contracts` em `apps/web` era `import type`
   (apagado antes do bundling), então o problema nunca aparecia. Corrigido
   com `resolve.extensionAlias` em `apps/web/next.config.mjs` — mesmo
   comportamento que `tsx`/`vitest` já tinham nativamente.
3. **Overflow horizontal em tablet (768px), causa raiz e correção**: badges
   com `Tooltip` usam um `<span>` `position: absolute` que, mesmo com
   `opacity: 0`, soma na scrollable overflow do documento (regra do CSS,
   não bug do componente). Corrigido com `overflow-x: hidden` em `html` e
   `body` (`globals.css`) — nenhum conteúdo real é cortado, tabelas mantêm
   seu próprio `overflow-x-auto` interno. Complementarmente, nomes de
   região longos ganharam `truncate`+`min-w-0` no lugar certo (no elemento
   que encolhe, não só no contêiner).
4. **Sem mapa Leaflet/GeoJSON.** Decisão deliberada diante de um bloqueio
   real (seção 9, item 1) — a alternativa de baixar um GeoJSON público
   exigiria autorização explícita do usuário (regra de segurança do agente)
   e ainda não resolveria a falta de coordenadas na base; a alternativa de
   inventar coordenadas é proibida pelo projeto. Substituído por
   `RegionHeatGrid`, documentado como tal na própria interface.
   `leaflet`/`react-leaflet` não foram adicionados como dependência.
5. **Sem biblioteca de gráficos.** `LineChart` em SVG puro — o volume de
   pontos é pequeno (no máximo uma competência por mês da base DEMO),
   suficiente para não justificar uma dependência nova (`recharts` ou
   equivalente), consistente com a filosofia de dependências mínimas já
   estabelecida no projeto (ADR-001).
6. **Sem seletor de RiskConfig na UI** e **sem filtro de
   sexo/faixa-etária/vulnerabilidade** — ambos porque a API da Fase 3 não
   suporta, e criar um filtro decorativo que não muda a consulta ao
   servidor foi evitado deliberadamente (regra explícita desta fase).
7. **`GET /api/indicadores` tratado como catálogo de definições**, não como
   listagem de valores — decisão já tomada na Fase 3, reaproveitada sem
   mudança; valores por município aparecem no detalhe do município.
8. **`RiskScorePanel`/`ComponenteCard` não viraram componentes globais
   fragmentados demais** — `RiskScorePanel` é reutilizável (`components/domain`),
   mas `ComponenteCard` ficou local a `/municipios/[id]/page.tsx` por não
   ser usado em nenhuma outra página — evita abstração prematura.

## 15. Próximos passos (Fase 5)

Não implementados nesta fase, ficam para a Fase 5 conforme o roadmap:

- Ingestão real via `etl/` (pySUS, CNES, IBGE) — só quando isso existir a
  base deixa de ser 100% DEMO.
- Carga geográfica oficial completa (645 municípios de SP, códigos IBGE
  reais) — pré-requisito real para o mapa geográfico funcionar sem inventar
  dado; **coordenadas (`latitude`/`longitude`) precisam ser populadas** para
  o bloqueio documentado nesta fase deixar de existir.
- Definição de janela móvel/sazonalidade de `TENDÊNCIA`, fórmula de
  composição de `SEVERIDADE`, fonte de `VULNERABILIDADE` — quando/se
  definidas, os componentes correspondentes passam a produzir valor sem
  nenhuma mudança de UI (o tratamento de indisponibilidade já existe e
  desaparece sozinho quando `disponivel = true`).
- Reprocessamento periódico e defasagem de publicação exibida na interface
  (hoje `FreshnessIndicator` só mostra competência e `calculadoEm`, não uma
  defasagem real — `FonteDados.defasagemEsperadaDias` existe no schema mas
  não é exposto pela API ainda).

Esta implementação não avança para a Fase 5 — aguardando autorização.
