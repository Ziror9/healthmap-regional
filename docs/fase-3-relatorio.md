# Fase 3 — Relatório de Implementação

## 1. Status

**CONCLUÍDA** (parcial — endpoints de KPI/mapa/série temporal e camada de
`policies` ficam para fases seguintes, não por falha de implementação, mas
porque não foram pedidos explicitamente nesta rodada e alguns dependem de
definições ainda em aberto — ver seção 11).

## 2. Objetivo

Expor os dados já materializados pelas Fases 1 e 2 (catálogo geográfico e
Radar de Risco) através de uma API REST somente-leitura, com proveniência
explícita em toda resposta analítica, e uma página técnica em `apps/web`
provando que o frontend consegue consumir essa API sem tocar no banco.
Nenhuma metodologia nova foi inventada; nenhuma fase posterior foi
antecipada.

## 3. Endpoints criados

Todos montados em `apps/api/src/routes/index.ts`.

| Método | Rota | Descrição |
|---|---|---|
| GET | `/health` | Liveness (já existia, Fase 0 — continua funcionando) |
| GET | `/health/ready` | Readiness com checagem do PostgreSQL (já existia — continua funcionando) |
| GET | `/api/municipios` | Catálogo paginado, filtro `regiaoSaudeId` |
| GET | `/api/municipios/:municipioId` | Detalhe: dados territoriais + todos os `RiskScore`/`IndicadorMunicipal` disponíveis (filtráveis por `competenciaId`/`riskConfigId`/`ano`) |
| GET | `/api/regioes` | Catálogo paginado de `RegiaoSaude` |
| GET | `/api/competencias` | Catálogo paginado, filtro `ano` |
| GET | `/api/indicadores` | Catálogo de `IndicadorDefinicao`, com `disponivel` calculado |
| GET | `/api/risk` | Ranking de municípios (RiskScore) para competência/riskConfig/origem resolvidos |
| GET | `/api/risk/:municipioId` | Um `RiskScore` (ou `data: null` se não existir) |
| GET | `/api/risk/:municipioId/components` | `RiskComponenteValor` materializados do município |

Todos os endpoints de listagem aceitam `page`/`pageSize` (padrão 1/50, teto
200). Nenhum filtro além dos explicitamente pedidos foi criado.

## 4. Contratos criados (`packages/contracts`)

- `enums.ts` — adicionados `ComponenteRisco`, `ClassificacaoRisco`,
  `Confiabilidade`, `IndicadorDirecao` (ao lado de `Origem`/`Natureza`/
  `EixoTerritorial` já existentes). Mesma lógica de duplicação intencional
  já documentada no projeto (schema Prisma e `packages/risk/src/types.ts`
  mantêm suas próprias cópias — cada camada define seu tipo, não importa o
  de outra).
- `pagination.ts` — `paginationQuerySchema`, `paginationMetaSchema`,
  `buildPaginationMeta`.
- `geo.ts` — `regiaoSaudeSchema`, `municipioResumoSchema`.
- `competencia.ts` — `competenciaSchema`.
- `risk.ts` — `riskScoreItemSchema`, `riskComponenteItemSchema`,
  `riskFiltroQuerySchema`, `riskFiltroResolvidoSchema`.
- `indicador.ts` — `indicadorDefinicaoSchema`, `indicadorMunicipalItemSchema`.
- `municipio-detalhe.ts` — `municipioDetalheSchema` (compõe os anteriores).
- `error.ts` — `apiErrorSchema`, reexportado por `apps/api/src/types/http.ts`
  (`ApiErrorBody`) em vez de redefinido — elimina a única duplicação de tipo
  entre API e o que o frontend precisaria para parsear um erro.

## 5. Repositórios/serviços criados

**`packages/db`** (leitura, distinto da orquestração de cálculo da Fase 2):

- `repositories/catalog.ts` — `listMunicipios`, `getMunicipioById`,
  `listRegioesSaude`, `listCompetencias`, `getCompetenciaById`,
  `getCompetenciaMaisRecente`, `listIndicadorDefinicoes`,
  `listIndicadoresDoMunicipio`.
- `repositories/riskQuery.ts` — `getRiskConfigMeta`,
  `resolveDefaultRiskConfigId`, `listOrigensDistintasRiskScore`,
  `listRiskScores`, `getRiskScoreMunicipio`, `listRiskScoresDoMunicipio`,
  `listRiskComponentes`.

Nenhuma dessas funções agrega `FatoInternacaoResidencia`/`FatoInternacaoLocal`
— só leem `RiskScore`/`RiskComponenteValor`/`IndicadorMunicipal`, já
materializados pela Fase 2. `repositories/risk.ts` (Fase 2, orquestração de
cálculo) não foi alterado.

**`apps/api`**:

- `services/catalog.service.ts` — monta as respostas de catálogo.
- `services/risk.service.ts` — a peça com regra de negócio real: resolve
  filtros default (seção 7) e monta as respostas do Radar.
- `controllers/{municipios,regioes,competencias,indicadores,risk}.controller.ts`
  — só parsing HTTP + chamada ao service.
- `routes/{municipios,regioes,competencias,indicadores,risk}.routes.ts`.
- `validation/{parse,query}.ts` — schemas Zod de query string/params, todos
  via `parseOrThrow` (nunca deixa o Zod cru vazar, nunca stack trace).

## 6. Comportamento de origem REAL/DEMO

- `Origem` nunca é hardcoded no código: todo valor exibido em `meta.filtros.origem`
  ou em `item.origem` vem de uma linha do banco ou de uma query `groupBy`.
- Quando o cliente informa `?origem=`, a API filtra estritamente por esse
  valor (podendo devolver lista vazia, se não houver dado daquela origem).
- Quando o cliente **não** informa `origem`: a API consulta quais origens
  distintas existem no resultado (`listOrigensDistintasRiskScore`). Se houver
  mais de uma (REAL e DEMO simultâneas para a mesma competência/riskConfig),
  responde **`409 ORIGEM_AMBIGUA`** em vez de misturar as duas numa mesma
  lista — o cliente precisa desambiguar explicitamente. Se houver exatamente
  uma, ela aparece em `meta.filtros.origem` só para informação (não é
  reaplicada como filtro adicional, pois já é a única presente).
- Hoje só existe DEMO na base, então esse `409` nunca é observado na prática
  — mas o código está preparado para o dia em que REAL e DEMO convivem
  (Fase 5), sem exigir mudança de contrato.

## 7. Resolução de filtros quando omitidos (documentado, não inventado)

Implementado em `apps/api/src/services/risk.service.ts`, função
`resolverFiltros`:

| Filtro | Se informado | Se omitido |
|---|---|---|
| `competenciaId` | Valida que existe (404 se não) | `Competencia` mais recente por `dataRef` |
| `riskConfigId` | Valida que existe (404 se não) | `RiskConfig` com `oficial=true` se existir; senão, a mais recente (maior `id`) com pelo menos 1 componente ativo |
| `origem` | Filtra estritamente | Não filtra; bloqueia com 409 se houver mais de uma origem presente (seção 6) |

Nenhuma dessas regras altera a metodologia do Radar — são só a escolha de
qual resultado **já calculado** mostrar quando o cliente não pede um
específico. Nenhuma `RiskConfig` é oficial em nenhum ambiente conhecido
nesta fase, então o fallback (mais recente com componentes) é o caminho
realmente exercitado pelos testes.

## 8. Comportamento de supressão (ponto crítico)

A Fase 3 **não agrega fato bruto em nenhum endpoint**. Todos os valores
vêm de `RiskScore`/`RiskComponenteValor`, já materializados pela Fase 2 —
que aplicou `bool_or(suprimido)` na agregação SQL (ver
`packages/db/src/repositories/risk.ts`, inalterado nesta fase). A API só
repassa esses campos como estão: `disponivel: false` e `valorBruto: null`
nunca viram `0`. Verificado por teste automatizado
(`apps/api/src/__tests__/risk.test.ts`, casos "componente indisponível" e
"componente disponível") lendo diretamente os componentes `TENDENCIA`/
`SEVERIDADE`/`VULNERABILIDADE` (sempre indisponíveis nesta base — ver
`docs/fase-2-relatorio.md`) e confirmando `valorBruto`/`valorNormalizado`
nulos na resposta HTTP.

## 9. Testes executados

**`apps/api`** (novo, vitest + fetch contra `createApp()` numa porta
efêmera, banco real — sem mock de Express nem de Prisma): **32/32
passando**.

| Arquivo | Casos |
|---|---|
| `health.test.ts` | `/health`, `/health/ready` continuam funcionando |
| `municipios.test.ts` | listagem paginada, filtro `regiaoSaudeId`, detalhe, 404, 400 |
| `regioes.test.ts` | listagem |
| `competencias.test.ts` | listagem ordenada, filtro `ano`, 400 |
| `indicadores.test.ts` | catálogo com `disponivel` calculado |
| `risk.test.ts` | ranking default, filtro `competenciaId`/`riskConfigId`/`origem`, 404 (competência/riskConfig/município inexistentes), 400 (parâmetros inválidos), ausência de dados coerente (riskConfig sem componentes → lista vazia / `data: null`, não erro), origem DEMO explícita item a item, supressão nunca vira zero, componente disponível é número |
| `architecture-boundaries.test.ts` | nenhum controller usa Prisma/SQL direto; `apps/web` não importa `@healthmap/db`/`@prisma/client` |

**`packages/db`**: 27/27 (11 Fase 1 + 16 Fase 2, inalterados, ainda
passando). **`packages/risk`**: 43/43 (inalterados, ainda passando).

**Total: 102/102 testes passando** (`npm run test` na raiz).

`npm run typecheck` e `npm run lint` (raiz, todos os workspaces): sem erros.

## 10. Arquivos alterados

**Novos:**
- `packages/contracts/src/{pagination,geo,competencia,risk,indicador,municipio-detalhe,error}.ts`
- `packages/db/src/repositories/{catalog,riskQuery}.ts`
- `apps/api/src/validation/{parse,query}.ts`
- `apps/api/src/services/{catalog,risk}.service.ts`
- `apps/api/src/controllers/{municipios,regioes,competencias,indicadores,risk}.controller.ts`
- `apps/api/src/routes/{municipios,regioes,competencias,indicadores,risk}.routes.ts`
- `apps/api/src/__tests__/{setup,health,municipios,regioes,competencias,indicadores,risk,architecture-boundaries}.test.ts`
- `apps/web/lib/api.ts`
- `apps/web/app/radar/page.tsx`
- `docs/fase-3-relatorio.md` (este arquivo)

**Modificados:**
- `packages/contracts/src/enums.ts` (4 enums novos), `src/index.ts` (exports)
- `packages/db/src/index.ts` (exporta os repositórios novos)
- `apps/api/src/routes/index.ts` (monta as rotas novas)
- `apps/api/src/types/http.ts` (`ApiErrorBody` reexporta `@healthmap/contracts`)
- `apps/api/package.json` (script `test`, devDependency `vitest`)
- `apps/web/app/page.tsx` (link para `/radar`)
- `package-lock.json`
- `docs/roadmap.md`, `docs/known-limitations.md`, `CLAUDE.md`

`docs/architecture.md` **não foi alterado**: nenhuma decisão arquitetural
mudou (a API segue exatamente `routes -> controllers -> services ->
packages/db`, sem SQL fora de `packages/db`, sem cálculo em `apps/web`) —
a instrução desta rodada era só atualizar esse arquivo se algo realmente
tivesse mudado. Registro à parte: seu cabeçalho ainda diz "Fase 0
concluída", desatualizado desde a Fase 1 — não corrigido aqui por ser fora
do escopo pedido.

Nenhum arquivo de `packages/risk` ou `etl/` foi tocado.

## 11. Limitações

1. **API pública, sem autenticação.** Não deve rodar fora de
   desenvolvimento (Fase 6 resolve isso).
2. **Sem KPIs de cabeçalho, mapa, série temporal ou página de
   metodologia.** A semântica operacional dos KPIs nunca foi definida
   (pendência herdada do roadmap original da Fase 3) — implementar isso
   agora seria inventar requisito, não seguir o que existe.
3. **Sem camada `policies`.** Fica para a Fase 6 junto com RBAC efetivo.
4. **Nenhuma `RiskConfig` é oficial** em nenhum ambiente conhecido — o
   fallback de resolução de filtro (seção 7) é o único caminho exercitado.
   Quando uma config oficial existir, o comportamento muda automaticamente
   (sem alteração de código) para priorizá-la.
5. **`409 ORIGEM_AMBIGUA` nunca é exercitado pelos testes** contra dado
   real, porque a base hoje é 100% DEMO — o código está coberto por leitura
   estrutural do fluxo, não por um teste que produza REAL e DEMO
   simultaneamente (isso exigiria popular dado REAL, fora do escopo desta
   fase).
6. **Paginação (teto 200) não testada contra volume real** — a base DEMO
   tem poucas dezenas de linhas por tabela.
7. **Página `/radar` é técnica, não o dashboard final** — sem mapa, sem
   filtros interativos, sem design definitivo. Isso é explicitamente Fase 4.
8. Todas as limitações herdadas das Fases 1 e 2 (geografia sintética,
   taxonomias provisórias, `TENDENCIA`/`SEVERIDADE`/`VULNERABILIDADE`
   sempre indisponíveis, classificação por quintil provisória) continuam
   valendo — a API só expõe o que já existia, não resolveu nenhuma delas.

## 12. Decisões tomadas durante a implementação

1. **Resolução de filtros default documentada em vez de exigir todos os
   parâmetros** — ver seção 7. Escolhida por ser a opção mais conservadora
   que não inventa metodologia (só decide *qual resultado já calculado*
   mostrar).
2. **`409 ORIGEM_AMBIGUA` em vez de escolher uma origem arbitrariamente**
   quando mais de uma está presente — evita decidir por conta própria que
   REAL "vale mais" que DEMO ou vice-versa; a decisão é explicitamente do
   cliente da API.
3. **Nenhuma agregação de fato bruto em Fase 3** — todos os endpoints leem
   `RiskScore`/`RiskComponenteValor`/`IndicadorMunicipal`, nunca
   `FatoInternacaoResidencia`/`FatoInternacaoLocal` diretamente. Isso torna
   a preocupação central de supressão (seção 8) automática por construção,
   em vez de precisar ser reimplementada na API.
4. **`packages/risk` não é importado por `apps/api` nesta fase** — como
   nenhum endpoint recalcula nada, não há necessidade. Consistente com a
   nota arquitetural do relatório da Fase 2 (a orquestração de *cálculo*
   continua em `packages/db`/scripts, não migrou para `apps/api`, porque
   Fase 3 não pediu recálculo).
5. **`GET /api/indicadores` lista definições (`IndicadorDefinicao`), não
   valores individuais** — a rota plural "indicadores" e o pedido
   "consultar indicadores municipais disponíveis" foram lidos como
   catálogo (quais indicadores existem e se têm dado), não como uma
   listagem de todos os valores de todos os municípios. Valores por
   município aparecem no detalhe (`GET /api/municipios/:id`).
6. **Testes de fronteira arquitetural (`architecture-boundaries.test.ts`)**
   implementados como scan estático de arquivos-fonte (import specifiers,
   não substring ingênua — a primeira versão teve um falso positivo porque
   um comentário deste próprio arquivo mencionava `@healthmap/db` como
   exemplo do que não fazer). Não substitui revisão de código, mas
   transforma a regra em algo que quebra o build se violada no futuro.
7. **Teste de integração roda `createApp()` numa porta efêmera real**, sem
   `supertest` — `fetch` global do Node 20 já é suficiente e evita uma
   dependência nova. Mesma filosofia dos testes de `packages/db` (Fase 1/2):
   integração contra o Postgres de desenvolvimento já seedado, não um banco
   de teste isolado.

## 13. O que NÃO foi implementado

Pertence explicitamente às próximas fases:

- **Fase 4** — dashboard, mapa de calor, série temporal, ranking com
  drill-down visual, página de metodologia, design system de proveniência.
- **Fase 5** — ingestão real, ETL Python, carga geográfica oficial completa,
  definição de janela/sazonalidade de TENDÊNCIA e composição de SEVERIDADE,
  fonte de VULNERABILIDADE.
- **Fase 6** — autenticação, RBAC efetivo, camada `policies`, trilha de
  auditoria funcionando.
- **Fase 7** — projeção estatística, calibração de pesos oficiais.

Nenhuma metodologia do Radar foi alterada ou inventada. Nenhum peso foi
definido. Nenhuma fase posterior foi antecipada.

## 14. Próximo passo

A Fase 4 (Dashboard) está pronta para ser iniciada quando autorizada — a
API que ela vai consumir existe, está testada e documentada, incluindo o
que ainda não está disponível e por quê. Esta implementação não avança
para a Fase 4 — aguardando autorização.
