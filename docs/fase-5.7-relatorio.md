# Fase 5.7 — Relatório de Implementação

## 1. Objetivo

Criar o **Radar Municipal** — primeira visualização territorial interativa
do HealthMap: mapa dos 645 municípios REAL de SP, coloridos por um
indicador à escolha, com tooltip, ranking ordenável e painel de
detalhamento ao clicar. Nenhum indicador novo, nenhuma fonte nova, nenhum
recálculo — só uma nova forma de **ler** dado já materializado pelas Fases
5.2-5.6 (SIH, SIM, RiskScore, IPVS).

## 2. Arquitetura

`route → controller → service → packages/db`, mesma fronteira das Fases
1-5.6. Nenhum SQL em `apps/api`, nenhum cálculo em `apps/web`. O serviço
(`apps/api/src/services/catalog.service.ts::listarIndicadorMunicipios`) só
orquestra funções de leitura já existentes ou aditivas — nenhuma fórmula
nova.

### 2.1 Reuso identificado antes de implementar (evitou reimplementação)

- **Mapa**: `apps/web/components/charts/map.tsx` (`MapaSP`) já desenhava os
  645 municípios via SVG puro a partir do GeoJSON estático
  (`apps/web/public/geo/sp-municipios.geojson`, 645 features, chave
  `codarea` = `Municipio.codigoIbge7`). Generalizado com 3 props opcionais
  (`corPorCodigo`, `tooltipPorCodigo`, `onClickMunicipio`) — quando
  omitidas, o comportamento é **idêntico** ao anterior (RiskScore em `/` e
  `/radar`, zero regressão).
- **Detalhe de município**: `GET /api/municipios/:id` já existia e já
  devolvia `indicadores[]`/`riscos[]`. Estendido (não recriado) com
  `internacoesAnuais[]`/`obitosOncologicosAnuais[]` — os dois totais brutos
  que faltavam (não são `IndicadorMunicipal`, são o fato agregado em si).
- **Agregados**: `getAgregadoInternacaoResidenciaAnual`,
  `getAgregadoObitoResidenciaAnual`, `getIndicadorMunicipalPorDefinicao`
  (todas de `packages/db/src/repositories/risk.ts`, já existentes desde as
  Fases 2/5.2/5.6) são chamadas diretamente pelo novo
  `repositories/radarQuery.ts` — nenhuma segunda implementação de
  agregação ou de regra de supressão.
- **RiskScore**: `listRiskScores` (Fase 3, `riskQuery.ts`) reaproveitado
  sem alteração. Nenhuma `RiskConfig`/`RiskConfigComponente` nova.

### 2.2 Incompatibilidade encontrada e decisão tomada

RiskScore não tem grão anual (é por competência/mês); o filtro "Ano" da
especificação, porém, é uniforme para todos os indicadores. Resolvida sem
inventar metodologia nova: `getCompetenciaMaisRecenteComRiskScorePorAno`
(nova função, `riskQuery.ts`) escolhe a competência mais recente **dentro**
do ano selecionado que já tem RiskScore para o riskConfig resolvido — mesma
filosofia de resolução de default já usada por `risk.service.ts` desde a
Fase 3, só restrita a um ano. Nenhum "RiskScore anual" foi criado.

## 3. Endpoint novo

`GET /api/indicadores/municipios?indicador=<...>&ano=<opcional>&riskConfigId=<opcional>&origem=<opcional>`

Devolve os 645 municípios REAL de uma vez (nunca 1 requisição por
município — o mapa faz 1 chamada por troca de indicador). Indicadores
aceitos: `INTERNACOES`, `TAXA_INTERNACAO_10K_HAB`, `OBITOS_ONCOLOGICOS`,
`TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB`, `RISK_SCORE`, `VULNERABILIDADE`.

`ano` nunca é inventado: se omitido, resolve para o mais recente
efetivamente disponível **para aquele indicador especificamente**
(`meta.filtros.anosDisponiveis`, calculado a cada chamada, nunca
hardcoded); se informado mas inexistente, `404 ANO_NAO_DISPONIVEL`.

Cada item: `{ municipio: {id, nome, codigoIbge7}, valor, disponivel, motivo, origem }`.
`valor` é sempre `null` quando `disponivel=false` (supressão n<5 ou
ausência de fato/indicador nesse ano) — nunca `0`. `motivo` distingue as
duas causas para o tooltip.

`GET /api/municipios/:id` estendido (mesmo contrato, campos aditivos) com
`internacoesAnuais`/`obitosOncologicosAnuais` — usado pelo painel de
detalhamento ao clicar (1 requisição por clique, nunca por município do
mapa).

## 4. Indicadores da primeira versão e fonte de cada um

| Indicador | Fonte | Grão de disponibilidade | Reaproveita |
|---|---|---|---|
| `INTERNACOES` | `gold.FatoInternacaoResidencia` | Ano (soma de competências, `bool_or` suprimido) | `getAgregadoInternacaoResidenciaAnual` |
| `TAXA_INTERNACAO_10K_HAB` | `gold.IndicadorMunicipal` | Ano | `getIndicadorMunicipalPorDefinicao` |
| `OBITOS_ONCOLOGICOS` | `gold.FatoObitoResidencia` (Fase 5.6, já grão anual) | Ano | `getAgregadoObitoResidenciaAnual` |
| `TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB` | `gold.IndicadorMunicipal` | Ano | `getIndicadorMunicipalPorDefinicao` |
| `RISK_SCORE` | `gold.RiskScore` | Competência (resolvida dentro do ano) | `listRiskScores` |
| `VULNERABILIDADE` | `gold.IndicadorMunicipal` (`IPVS_MEDIA_PONDERADA_SETOR`) | Ano (fixo 2022, Censo) | `getIndicadorMunicipalPorDefinicao` |

## 5. Geometria

Nenhuma dependência nova. `apps/web/public/geo/sp-municipios.geojson`
(IBGE, 645 features, ~275 KB, já versionado desde a Fase 5) é a mesma
malha usada pela Visão Geral. Chave de junção: `codigoIbge7`
(`Municipio.codigoIbge7` = `feature.properties.codarea`) — **não**
`codigoIbge6` como uma versão anterior da especificação sugeria: o
GeoJSON já usa o código de 7 dígitos como chave desde que foi gerado
(Fase 5), é a mesma chave já testada e documentada
(`apps/web/public/geo/README.md`), e nenhum join por nome é feito em
nenhum ponto do código.

## 6. Escala de cor

`apps/web/lib/radar-municipal-color.ts` — quantil sobre os valores
`disponivel=true` já retornados pela API (mesmo raciocínio de
`classificarPorQuintil`, `packages/risk/src/score.ts`, mas para
apresentação: não persiste nada, não é a metodologia do RiskScore).
Município indisponível recebe cor neutra (`fill-muted`), nunca entra num
balde.

## 7. Supressão e disponibilidade

Testado end-to-end (`apps/api/src/__tests__/indicadores-municipios.test.ts`)
e verificado manualmente: município suprimido ou sem fato no ano aparece
com `valor=null`, `disponivel=false`, cor neutra no mapa, "Não disponível"
no painel de detalhe — nunca `0`. Confirmado que `INTERNACOES` reproduz a
mesma limitação estrutural já documentada (Fase 5.2/5.7-diagnóstico): só 1
dos 645 municípios tem célula não suprimida no ano inteiro (efeito
`bool_or` sobre grão fino) — o Radar Municipal **não esconde** isso, exibe
honestamente "1 de 645 municípios com dado disponível".

## 8. Testes

- `apps/api/src/__tests__/indicadores-municipios.test.ts` (9 testes,
  integração real contra a API+banco): 645 municípios/prefixo IBGE
  correto, indicador solicitado = indicador retornado, supressão nunca
  vira 0, filtro de ano rejeita ano inexistente com 404, RiskScore não
  recalcula nada (contagem de `RiskConfig`/`RiskComponenteValor` antes e
  depois idêntica), valor de `RISK_SCORE` bate byte a byte com
  `RiskScore.indice` já gravado, origem sempre REAL, indicador inválido
  rejeitado com 400, `internacoesAnuais`/`obitosOncologicosAnuais` do
  detalhe de município respeitam supressão.
- `apps/web`: sem framework de testes automatizados (mesma decisão já
  registrada em `docs/known-limitations.md` desde a Fase 4 — não criado
  agora sem necessidade). Validado manualmente no navegador: troca de
  indicador (6/6), troca de ano, tooltip, clique no mapa e no ranking,
  painel de detalhamento com os 6 campos, ordenação do ranking
  (maior→menor / menor→maior), estado vazio, cor por quantil, legenda.
- `typecheck`/`lint`/`build` (monorepo inteiro) e `packages/db`/`apps/api`
  vitest: todos limpos, exceto os 6 testes de fases 5.3-5.5 já
  diagnosticados e não corrigidos (fora do escopo desta fase, ver
  `docs/known-limitations.md`).

## 9. Frontend

`apps/web/app/radar-municipal/page.tsx` (rota nova, adicionada à
navegação). Reaproveita `PageHeader`/`PageContent`/`Card`/`Select`/
`EmptyState`/`ErrorState`/`LoadingState`/`ProvenanceBadge` — mesmo design
system das demais páginas, nenhum componente visual novo além do próprio
mapa/ranking/legenda/painel desta fase. `RiskScore`/`RiskConfig` não são
tocados por nenhum código de frontend (consumo somente-leitura).

## 10. Limitações

- `INTERNACOES` (bruto) e `TAXA_INTERNACAO_10K_HAB` herdam a limitação de
  supressão de grão fino já documentada (cobertura de 1 município/ano) —
  não corrigida nesta fase (fora de escopo: exigiria o mesmo pivô de grão
  anual já aplicado a `FatoObitoResidencia` na Fase 5.6, decisão
  metodológica separada).
- `VULNERABILIDADE` está fixa em 2022 (ano do Censo/IPVS usado, Fase 5.4) —
  `anosDisponiveis` para esse indicador sempre devolve `[2022]`.
- Painel de detalhamento mostra o valor mais recente disponível de cada
  métrica quando o ano da métrica não coincide exatamente com o ano
  selecionado no filtro principal (ex.: ver Risk Score de dezembro/2024
  enquanto o filtro mostra Internações de outro ano) — comportamento
  intencional (nunca inventa dado do ano filtrado se ele não existir para
  aquela métrica), mas vale deixar explícito.
- Sem persistência de filtro na URL (indicador/ano/município selecionado
  não sobrevivem a um refresh) — escopo mínimo desta fase, diferente de
  `/radar`/`/` que usam `useRiskFiltersUrl`.

## 11. Validação final

Ver tabela e números no relatório de resultado da fase (seção 22 da
especificação) — confirmado manualmente no navegador e via testes de
integração: 645/645 municípios com `codigoIbge7` presente para todo
indicador; `TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB` com `anosDisponiveis:
[2024]` (mesma lacuna de população 2023 da Fase 5.6); `RISK_SCORE` com
`anosDisponiveis` incluindo `2024`, resolvendo para dez/2024; nenhuma
`RiskConfig`/`RiskComponenteValor` criada pelas chamadas do Radar
Municipal (confirmado por contagem antes/depois em teste automatizado).
