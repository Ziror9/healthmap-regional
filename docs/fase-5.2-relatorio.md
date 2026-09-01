# Fase 5.2 — Relatório de Implementação

## 1. Objetivo

Item de maior valor apontado no fechamento da Fase 5.1 (`docs/fase-5.1-relatorio.md`
§10): ingerir população REAL (IBGE) para destravar o primeiro indicador
REAL que não depende do CNES — `TAXA_INTERNACAO_10K_HAB`, já definido desde
a Fase 2 e já calculado para a base DEMO, mas nunca antes calculado sobre
dado REAL. Escopo deliberadamente estreito: não reabre Pressão Hospitalar
Estimada REAL (continua bloqueada, ver seção 5), não implementa
TENDÊNCIA/SEVERIDADE/VULNERABILIDADE (sem definição metodológica, sem
mudança desde a Fase 0/1) e não introduz nenhuma segunda implementação da
fórmula da taxa — reaproveita `calcularTaxaPor10k` de `packages/risk`,
exatamente a mesma usada pelo DEMO (CLAUDE.md #3: "o índice de risco tem
uma única implementação").

## 2. Auditoria inicial (antes de qualquer alteração)

Confirmado no repositório, não assumido:

- `IndicadorDefinicao`/`IndicadorMunicipal` (`TAXA_INTERNACAO_10K_HAB`) já
  existiam desde a Fase 2 (`seed-demo.ts`), com `denominador` no schema
  desde a Fase 1 mas nunca preenchido por nenhum script até agora.
- `packages/risk/src/components/tendencia.ts::calcularTaxaPor10k` já era a
  função correta e suficiente — nenhuma mudança nela foi necessária.
- `calculate-risk-demo.ts` já calculava a taxa para DEMO via
  `getAgregadoPopulacao`/`getAgregadoInternacaoResidenciaAnual`, ambas em
  `packages/db/src/repositories/risk.ts` — mas `Populacao` (grão
  município×ano×faixaEtaria×sexo, `NOT NULL`) só existe para o ano DEMO; não
  há fonte REAL nesse grão fora de ano de Censo (IBGE só publica a quebra
  etária/por sexo no Censo — 2010, 2022; entre censos só publica o TOTAL,
  tabela SIDRA 6579).
- `apps/api`/`packages/contracts`/`apps/web`: `listIndicadoresDoMunicipio`
  (`packages/db/src/repositories/catalog.ts`) já lia `denominador` e
  `origem` de `IndicadorMunicipal` sem filtro de origem nem de definição, e
  `GET /api/municipios/:id` e o detalhe de município (`apps/web`) já
  renderizavam qualquer linha de `indicadores` de forma genérica — **nenhuma
  mudança de API, contrato ou frontend foi necessária** para este indicador
  aparecer.
- Achado de ambiente (não relacionado ao dado, corrigido antes de continuar):
  `node_modules/@healthmap/*` estava symlinkado para uma cópia antiga do
  projeto fora deste diretório (`npm install` de uma sessão anterior rodado
  a partir de outro caminho) — `npm run typecheck` falhava em todo o
  monorepo por não resolver `@healthmap/db`/`@healthmap/contracts`/
  `@healthmap/risk`. Corrigido com `npm install` a partir da raiz correta;
  sem relação com o schema ou os scripts desta fase.

## 3. Decisão: nova tabela `PopulacaoEstimada`, não reaproveitar `Populacao`

A tabela SIDRA 6579 ("Estimativas de População", usada pelo IBGE para
cálculo do FPM) só publica o TOTAL por município/ano — sem quebra por
`faixaEtaria`/`sexo`, colunas `NOT NULL` em `Populacao`. Preencher essas
colunas com uma distribuição etária/por sexo não fornecida pela fonte seria
inventar um dado (proibido explicitamente pelo projeto). Em vez disso:

- **`gold.PopulacaoEstimada`** (nova, migration
  `20260820123206_fase5_2_populacao_estimada` — primeira migration nova
  desde a Fase 1, que já continha o schema completo): `municipioId x ano ->
  populacaoTotal`, com `origem`/`execucaoId` (mesmo padrão de proveniência
  de toda tabela `gold`). `@@unique([municipioId, ano])`.
- **Quem calcula, quem só ingere**: `etl/ingest_populacao.py` só grava o
  insumo (`PopulacaoEstimada`) — nunca calcula a taxa (`etl/README.md` regra
  4: "o ETL entrega insumos, não calcula o índice"). Quem materializa
  `IndicadorMunicipal` é `calculate-indicadores-real.ts` (TypeScript, via
  `packages/risk`), a mesma fronteira arquitetural já usada por
  `calculate-risk-demo.ts` desde a Fase 2.
- Censo 2022 (tabela SIDRA 9514, quebra real por idade/sexo) foi
  identificado mas **não ingerido nesta fase**: nenhuma competência SIH REAL
  ingerida até agora é do ano de 2022, então uma ingestão do Censo não
  destravaria nenhum cálculo novo imediatamente — ver seção 8.

## 4. `etl/ingest_populacao.py`

Fonte: `GET /api/v3/agregados/6579/periodos/{anos}/variaveis/9324?localidades=N6[N3[35]]`
(IBGE, API de Agregados/SIDRA, sem chave). `ANOS_SOLICITADOS = [2024, 2025]`
— os mesmos anos já cobertos por SIH REAL (2024, ver `ingest_sih.py`) mais
2025, buscado de forma oportunista. Anos sem estimativa publicada seriam
reportados como ausentes (checagem `populacao_ano_solicitado_disponivel`,
severidade `ALERTA`), nunca preenchidos — não ocorreu nesta execução: os
dois anos solicitados estavam disponíveis.

Parsing separado em `healthmap_etl.sources.ibge._parse_populacao_estimada`
(função pura, testável sem mock de rede — mesmo padrão de
`ingest_geografia.centroide_aproximado`): o marcador `"..."` da API SIDRA
para "sem dado" é tratado como ausência, nunca como população zero.

### 4.1 Resultado (execução real)

| Ano | Municípios gravados | Rejeitados | população mín. | população máx. |
|---|---|---|---|---|
| 2024 | 645 | 0 | 928 | 11.895.578 |
| 2025 | 645 | 0 | 932 | 11.904.961 |

Total: 1.290 linhas (`municipio x ano`). Mínimo/máximo plausíveis (menor
município de SP na casa das poucas centenas de habitantes; máximo bate com
a população da capital). Idempotência confirmada por execução dupla:
segunda rodada não altera nenhuma contagem (`SELECT ano, count(*) ...`
idêntico antes/depois) — upsert por `(municipioId, ano)` converge.

## 5. `calculate-indicadores-real.ts`

Mesma fronteira de `calculate-risk-demo.ts`: lê `gold` via `packages/db`,
chama `calcularTaxaPor10k` (`packages/risk`, sem segunda implementação),
grava `IndicadorMunicipal` via `packages/db`. Nunca grava
`RiskComponenteValor`/`RiskScore` REAL — Pressão Hospitalar Estimada REAL
continua indisponível (SIH e CNES REAL não compartilham competência, ver
`docs/sih-methodology.md` §11.2, sem mudança nesta fase).

Extensões aditivas em `packages/db/src/repositories/risk.ts` para viabilizar
o script, sem alterar comportamento de `calculate-risk-demo.ts`:

- `getMunicipios`/`getCompetencias` ganharam a opção `apenasReal` (inverso
  de `apenasDemo`, já existente desde a Fase 5.1);
- `getAgregadoPopulacaoEstimada(prisma, ano)` — mesmo formato de
  `getAgregadoPopulacao`, lendo `PopulacaoEstimada`;
- `IndicadorMunicipalInput`/`salvarIndicadorMunicipal` ganharam
  `denominador?: number` (campo já existente no schema desde a Fase 1,
  nunca antes preenchido por nenhum script — nem DEMO, que continua sem
  passá-lo, mudança não solicitada e fora de escopo).

Resolução de fonte de população, por ano: prefere `Populacao` (Censo, se
existir linha REAL para o ano) e cai para `PopulacaoEstimada` caso
contrário — nenhuma das duas é inventada; se nenhuma tiver o ano, o
município é pulado (contabilizado no resumo, nunca preenchido com 0).

Lineage: `FonteDados` nova, `HEALTHMAP_CALCULO_INDICADORES` — representa a
própria etapa de composição (packages/risk), distinta das fontes externas
(`DATASUS_SIH_RD`, `IBGE_POPULACAO_ESTIMADA`) que já têm sua própria
linhagem gravada pelos scripts Python que as ingeriram. Mesmo raciocínio de
`calculate-risk-demo.ts` reaproveitar `GERADOR_DEMO` para o passo de
cálculo.

### 5.1 Resultado (execução real) — achado importante, não um bug

```
645 municipios REAL, 1 ano com competencia REAL: 2024
IndicadorMunicipal REAL (taxa/10k): 1 linha
municipios sem populacao (censo nem estimativa) no ano: 0
```

Apenas **1 dos 645 municípios REAL** (São Paulo capital, `municipioId=578`)
recebeu o indicador: `valor=12,17` por 10k habitantes, `denominador=11.895.578`,
`ano=2024`. Investigado antes de aceitar como resultado final (não
presumido):

- `getAgregadoInternacaoResidenciaAnual` (já existente, sem alteração nesta
  fase) aplica `bool_or(suprimido)` sobre **todas** as células
  (`faixaEtaria x sexo`) de **todas** as 4 competências REAL do ano — uma
  única célula suprimida em qualquer mês torna o total anual do município
  inteiro `NULL` (regra de supressão idêntica à usada para DEMO desde a
  Fase 2, correta e não flexibilizada aqui).
- Confirmado direto no banco: 642 dos 645 municípios têm pelo menos 1
  célula de `FatoInternacaoResidencia` REAL em 2024, mas só 1 (a capital)
  não tem **nenhuma** célula suprimida no ano inteiro — internação
  oncológica é um evento raro por município/mês, então quase todo município
  fora da capital tem ao menos uma combinação faixaEtaria×sexo abaixo de
  `n<5` em algum dos 4 meses.
- **Não é um bug**: é a regra de supressão (`NULL != 0`, nunca aproximar)
  funcionando exatamente como desenhada, agora exposta a dado REAL esparso
  em vez da base DEMO (mais densa, por construção). Documentado em
  `docs/known-limitations.md` — ver seção 8 abaixo.

## 6. Banco

Uma migration nova: `20260820123206_fase5_2_populacao_estimada` — adiciona
só `gold.PopulacaoEstimada`. Nenhuma tabela existente foi alterada, nenhum
dado REAL ou DEMO anterior foi tocado.

## 7. REAL vs. DEMO

Verificado após a execução: `PopulacaoEstimada` só tem linhas `origem=REAL`
apontando para município REAL (prefixo `35`) — nenhuma mistura com os
municípios DEMO (`36xxxxx`). `IndicadorMunicipal` DEMO (`TAXA_INTERNACAO_10K_HAB`,
gravado desde a Fase 2) permanece inalterado; a nova linha REAL convive na
mesma tabela, distinguida por `origem` e por apontar a um município
distinto (nenhum município aparece com as duas origens).

## 8. Testes

- **Python**: `etl/tests/test_populacao.py` (7 testes novos, função pura de
  parsing) — total `etl/tests`: **81/81** (74 pré-existentes + 7).
- **TypeScript**: `packages/db/src/__tests__/fase5.2.test.ts` (10 testes
  novos: `PopulacaoEstimada` — cobertura/idempotência/proveniência/mistura
  DEMO×REAL — e `IndicadorMunicipal` REAL — denominador presente,
  município REAL, valores positivos). Um teste pré-existente
  (`fase1.test.ts`, contagem de tabelas do schema `gold`) precisou de
  atualização de `7` para `8` — regressão esperada e correta (nova tabela),
  não um bug introduzido. Total `packages/db`: **78/78** (68 pré-existentes
  + 10 novos). `packages/risk`: 43/43 (inalterado — nenhuma fórmula
  mudou). `apps/api`: 34/34 (inalterado — nenhuma mudança de API foi
  necessária, ver seção 2).
- `npm run typecheck`, `npm run lint`, `npm run build`: limpos (após a
  correção do symlink de `node_modules`, seção 2).
- **Verificação manual no navegador**: `/municipios/578` (São Paulo)
  exibe, na seção "Indicadores", "Taxa de internações oncológicas por
  10.000 habitantes — 12,17 por 10.000 habitantes — Ano 2024 — REAL", com
  `ProvenanceBadge` já tratando a origem REAL corretamente — nenhuma
  mudança de frontend foi necessária para isso funcionar.

## 9. Pendências / limitações

- **Cobertura do indicador é de facto 1 município** para 2024, pela razão
  estrutural da seção 5.1 — não vai crescer sozinho: só aumenta se (a) mais
  competências SIH REAL forem ingeridas com menos lacunas de supressão por
  município (improvável, é uma característica do dado, não uma lacuna de
  ingestão), ou (b) o produto decidir, no futuro, expor a taxa em um grão
  menos rígido que "ano inteiro sem nenhuma célula suprimida" — mudança de
  metodologia, fora do escopo desta fase.
- **Censo 2022 (tabela 9514, quebra por idade/sexo) não ingerido** — ver
  seção 3. Só passa a ter valor prático quando alguma competência SIH REAL
  de 2022 existir no catálogo espelhado pelo pysus (não verificado nesta
  fase).
- Nenhuma mudança em `TENDÊNCIA` (o indicador OBSERVADO calculado aqui é o
  que fundamenta o componente, mas o componente em si — variação em janela
  móvel com sazonalidade — continua indisponível, sem definição
  metodológica, sem mudança desde a Fase 2).
- `IndicadorMunicipalInput.denominador` só é preenchido pelo caminho REAL
  novo; `calculate-risk-demo.ts` continua sem passá-lo para a taxa DEMO
  (mudança não solicitada, evitada deliberadamente).

## 10. Próximo passo recomendado

Nenhuma ação de código simples destrava mais cobertura deste indicador
(seção 9). O próximo item de maior valor real volta a ser side a side com o
que já era verdade ao fim da Fase 5.1: avaliar uma fonte alternativa de
capacidade hospitalar histórica (para reabrir Pressão Hospitalar Estimada
REAL) ou aceitar a limitação estrutural do CNES/DEMAS e priorizar Fase 6
(segurança/governança), já que a Fase 5 está com seu critério de conclusão
plenamente atingido para os dados atualmente alcançáveis sem inventar fonte
ou metodologia.
