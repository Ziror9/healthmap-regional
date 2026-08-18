# Fase 5.1 — Relatório de Implementação

## 1. Objetivo

Duas frentes, ambas sobre a fundação da Fase 5, sem tocar arquitetura,
contratos ou decisões metodológicas já validadas:

1. Expandir a ingestão REAL do SIH/SUS de 1 competência (2024-02, POC) para
   todo o catálogo disponível do ano de 2024.
2. Garantir que a competência selecionada pelo usuário seja respeitada em
   toda a cadeia (banco → API → frontend), sem substituição silenciosa por
   outra competência em nenhum ponto.

## 2. Auditoria inicial (antes de qualquer alteração)

Confirmado no repositório, não assumido:

- Schema (`packages/db/prisma/schema.prisma`): `Competencia`,
  `FatoInternacaoResidencia/Local`, `IngestaoExecucao`, `FonteDados` já
  suportam múltiplas competências por chave natural
  (`@@unique([ano, mes])`, `@@unique([municipioId, competenciaId, ...])`)
  — **nenhuma migration foi necessária**.
- `etl/ingest_sih.py`: já idempotente por natureza (upsert `ON CONFLICT DO
  UPDATE`), já reporta competência ausente no catálogo sem inventar dado,
  já grava proveniência completa. Só precisava de mais competências na
  lista `COMPETENCIAS_POC`.
- `apps/api/src/services/risk.service.ts` (`resolverFiltros`): quando
  `competenciaId` é informado explicitamente, a API já resolvia
  corretamente (404 se a competência não existe; lista/`data:null` vazios
  se não há dado — nunca substituição). **O bug estava no caminho sem
  filtro explícito**: a competência default era escolhida por `dataRef`
  mais recente, sem verificar se havia algum `RiskScore` — confirmado ao
  vivo (`GET /api/risk` sem parâmetros devolvia `data: []` porque a
  competência mais recente era o snapshot do CNES, sem Radar nenhum).
- `apps/web/app/municipios/[id]/page.tsx`: **não lia nenhum parâmetro de
  competência da URL** — sempre chamava `getMunicipio(id)` sem filtro e
  exibia `riscos[0]` (o mais recente para aquele município), ignorando
  qualquer competência selecionada em `/` ou `/radar`. Este era o bug mais
  relevante para a "regra crítica" desta fase.
- `apps/web/lib/use-risk-filters.ts`: já sincroniza competência/riskConfig/
  origem com a URL via `useRiskFiltersUrl` — mecanismo correto já existia,
  só não era usado por todas as páginas.

## 3. Ingestão SIH/SUS — 2024 inteiro

`etl/ingest_sih.py`: `COMPETENCIAS_POC` ampliado de
`[(2024,1), (2024,2), (2024,3)]` para as 12 competências de 2024. Nenhuma
regra de transformação, supressão ou proveniência foi alterada — mesmo
código de `sih_transform.py`, `lineage.py`, `quality.py` da Fase 5.

Executado dentro do container Linux (`etl/docker/Dockerfile.sih`,
`docker run --rm -e DATABASE_URL=...host.docker.internal... healthmap-etl-sih`),
mesma estratégia da Fase 5 — preservada porque continua sendo a solução
correta (`pyreaddbc` sem wheel Windows). `docker-compose.yml` não foi
alterado.

### 3.1 Resultado por competência

| Competência | Catálogo pysus | Registros brutos | Oncológicos | Válidos | Município(res.) | Município(local) | Status |
|---|---|---|---|---|---|---|---|
| 2024-01 | ❌ ausente | — | — | — | — | — | não processada |
| 2024-02 | ✅ | 221.117 | 16.020 | 16.016 | 591 | 213 | PARCIAL |
| 2024-03 | ❌ ausente | — | — | — | — | — | não processada |
| 2024-04 | ❌ ausente | — | — | — | — | — | não processada |
| 2024-05 | ❌ ausente | — | — | — | — | — | não processada |
| 2024-06 | ✅ | 240.552 | 16.279 | 16.277 | 597 | 205 | PARCIAL |
| 2024-07 | ❌ ausente | — | — | — | — | — | não processada |
| 2024-08 | ✅ | 246.085 | 16.914 | 16.914 | 603 | 213 | SUCESSO |
| 2024-09 | ❌ ausente | — | — | — | — | — | não processada |
| 2024-10 | ❌ ausente | — | — | — | — | — | não processada |
| 2024-11 | ❌ ausente | — | — | — | — | — | não processada |
| 2024-12 | ✅ | 225.756 | 15.433 | 15.427 | 590 | 208 | PARCIAL |

Município(res.)/Município(local) = municípios distintos com pelo menos 1
célula em `FatoInternacaoResidencia`/`FatoInternacaoLocal` para a
competência. Detalhe de células por tabela gold, confirmado direto no
banco após a ingestão:

| Competência (id) | `FatoInternacaoResidencia` (células / suprimidas / soma internações) | `FatoInternacaoLocal` (células / soma internações) |
|---|---|---|
| 2024-02 (11) | 3.467 / 2.829 / 10.346 | 1.177 / 14.819 |
| 2024-06 (14) | 3.601 / 2.939 / 10.473 | 1.173 / 15.160 |
| 2024-08 (15) | 3.703 / 3.030 / 10.917 | 1.211 / 15.726 |
| 2024-12 (16) | 3.461 / 2.838 / 9.994 | 1.182 / 14.158 |

`8` competências ausentes no catálogo: `2024-01, 03, 04, 05, 07, 09, 10,
11`. Nenhuma foi preenchida com dado inventado, copiado de outro mês, ou
com DEMO disfarçado de REAL — o pipeline simplesmente pulou e seguiu para
a próxima, exatamente como documentado em `sih.py`/`ingest_sih.py`.

Causa da lacuna do catálogo pysus continua **não determinada** (não
presumida) — ver `docs/sih-methodology.md` §8.

### 3.2 Idempotência (comprovada, não assumida)

Duas execuções completas do pipeline (2024-01→12) rodadas nesta sessão:

| Métrica | Antes da 1ª execução (só 2024-02 existia) | Depois da 1ª execução | Depois da 2ª execução |
|---|---|---|---|
| `FatoInternacaoResidencia` (REAL, todas competências) | 3.467 | 14.232 | 14.232 |
| `FatoInternacaoLocal` (REAL, todas competências) | 1.177 | 4.743 | 4.743 |
| `FatoInternacaoResidencia` competência 2024-02 (soma internações) | 10.346 | 10.346 | 10.346 |
| `FatoInternacaoLocal` competência 2024-02 (soma internações) | 14.819 | 14.819 | 14.819 |
| `IngestaoExecucao` (fonte SIH) | 2 | 6 | 10 |

Contagens e somas de fato **idênticas** entre a 1ª e a 2ª execução — zero
duplicação, confirmado nas duas tabelas de fato para as 4 competências.
`IngestaoExecucao` cresce a cada execução (4 novas linhas por rodada) por
design: é a trilha de auditoria de cada *tentativa* de ingestão, não do
dado em si — cada execução é registrada mesmo quando converge para o
mesmo resultado. Reexecutar 2024-02 sozinho (herdado da Fase 5, também
verificado) tem o mesmo comportamento.

## 4. Regra crítica de competência — auditoria e correção

### 4.1 O que já estava correto

- `resolverFiltros` (`risk.service.ts`) com `competenciaId` explícito: 404
  se a competência não existe; lista vazia se não há `RiskScore` para
  ela — nunca substitui.
- `GET /api/municipios/:id?competenciaId=X`: já filtrava `riscos`
  corretamente por competência (`listRiskScoresDoMunicipio`) — o bug era
  só o frontend nunca enviar esse parâmetro.
- `GET /api/indicadores` e `GET /api/competencias`: catálogos/definições,
  sem competência "resolvida" nenhuma — nada a corrigir.
- URL como fonte de verdade: `useRiskFiltersUrl` já persistia
  competência/riskConfig/origem na URL, sobrevivendo a refresh/voltar/
  avançar — já usado em `/` e `/radar`.

### 4.2 O que foi corrigido

**Bug 1 — default sem RiskScore (achado na auditoria de Fase 5, corrigido
antes desta fase e reverificado aqui).** `getCompetenciaMaisRecente`
escolhia a competência mais recente por `dataRef`, sem considerar se havia
`RiskScore`. Como o snapshot do CNES está sempre carimbado no mês da
própria ingestão (hoje 2026-08), essa virava "a mais recente" e o Radar
abria vazio por padrão. Corrigido com
`getCompetenciaMaisRecenteComRiskScore` (`packages/db/src/repositories/riskQuery.ts`),
usado como primeira tentativa, com fallback para o comportamento antigo se
nenhuma competência tiver `RiskScore`.

**Bug 2 — `/municipios/[id]` ignorava a competência selecionada (achado e
corrigido nesta fase).** A página nunca lia `competenciaId`/`riskConfigId`/
`origem` da URL. Corrigido:

- `buildMunicipioHref` (`apps/web/lib/use-risk-filters.ts`) — constrói o
  link para o detalhe do município carregando a competência/riskConfig/
  origem da página de origem. Usado em `/` (KPIs "Municípios em maior
  atenção" + clique no mapa) e `/radar` (nome do município na tabela).
- `apps/web/app/municipios/[id]/page.tsx` passa a ler `filtros` via
  `useRiskFiltersUrl` e a filtrar `municipio.riscos` (já buscado sem
  filtro, para manter o histórico completo disponível para o gráfico) pela
  competência/origem selecionadas — filtro client-side sobre dado já
  calculado pela API, não recálculo de índice/score.
- Quando a competência selecionada não tem `RiskScore` para aquele
  município específico: `EmptyState` explícito "Sem dados disponíveis
  para esta competência", com chips das competências em que há dado (se
  houver) para o usuário escolher conscientemente — nunca troca sozinho.
- `<FilterBar />` adicionado ao cabeçalho de `/municipios/[id]` — mesmo
  mecanismo global já usado em `/` e `/radar`, sem duplicar o filtro em
  lugares diferentes.
- Gráfico de histórico do índice: ponto da competência selecionada agora
  recebe destaque visual (`LineChart.indiceDestacado`) e o texto explicita
  qual competência está em destaque, distinguindo "histórico" (janela
  completa do gráfico) de "competência selecionada" (um ponto dele).

### 4.3 Testes de regressão adicionados

`apps/api/src/__tests__/municipios.test.ts`:

- `competenciaId` explícito nunca retorna risco de outra competência
  (verifica todos os itens de `riscos` contra o `competenciaId` pedido).
- Competência sem `RiskScore` para o município → `riscos: []`, nunca
  substituído por outra competência.

`apps/api/src/__tests__/risk.test.ts` (herdado da correção de Fase 5,
mantido e revalidado): prova que o default de `/api/risk` nunca resolve
para uma competência sem `RiskScore`, mesmo havendo uma mais recente por
data.

## 5. Preparação para SIH × CNES (matriz de sobreposição)

| Competência | SIH REAL | CNES REAL | Sobreposição | Pressão Hospitalar REAL possível |
|---|---|---|---|---|
| 2024-01 | ❌ | ❌ | ❌ | ❌ |
| 2024-02 | ✅ | ❌ | ❌ | ❌ |
| 2024-03 | ❌ | ❌ | ❌ | ❌ |
| 2024-04 | ❌ | ❌ | ❌ | ❌ |
| 2024-05 | ❌ | ❌ | ❌ | ❌ |
| 2024-06 | ✅ | ❌ | ❌ | ❌ |
| 2024-07 | ❌ | ❌ | ❌ | ❌ |
| 2024-08 | ✅ | ❌ | ❌ | ❌ |
| 2024-09 | ❌ | ❌ | ❌ | ❌ |
| 2024-10 | ❌ | ❌ | ❌ | ❌ |
| 2024-11 | ❌ | ❌ | ❌ | ❌ |
| 2024-12 | ✅ | ❌ | ❌ | ❌ |

**Nenhuma linha tem ✅ em "Pressão Hospitalar REAL possível".** Motivo
estrutural, não de cobertura: a fonte CNES/DEMAS usada por
`etl/ingest_cnes.py` não expõe histórico por competência — sempre devolve
o estado *atual*, gravado na competência do mês da própria ingestão (hoje
2026-08, `obter_ou_criar_competencia_atual()`). Reingerir CNES hoje ainda
gravaria em 2026-08, não em nenhum mês de 2024 — não é uma pendência de
"rodar de novo", é uma limitação da fonte disponível. Nenhuma aproximação
temporal (usar o snapshot de 2026-08 como proxy de qualquer competência de
2024) foi feita — produziria um número REAL sobre premissa não validada,
o que este projeto não faz. Detalhe completo:
`docs/sih-methodology.md` §11.2.

## 6. Banco

**Nenhuma migration foi necessária.** Schema já suportava múltiplas
competências REAL por chave natural desde a Fase 1. Confirmado por
inspeção do schema antes de qualquer alteração (seção 2) — nenhuma tabela
foi recriada, nenhum dado REAL foi apagado ou substituído.

## 7. REAL vs. DEMO

Nenhuma linha DEMO foi tocada. Verificado após as duas execuções do SIH:
`RiskScore`/`RiskComponenteValor` continuam 100% DEMO (0 linhas REAL —
esperado, ver seção 5); `FatoInternacaoResidencia`/`Local` DEMO
(competências 1-6, 270 células cada) inalteradas; municípios DEMO (prefixo
`36xxxxx`) não receberam nenhuma linha SIH REAL (o script só cruza por
`codigoIbge7 LIKE '35%'`, mesma trava da Fase 5).

## 8. Testes

- Python: 74/74 (`etl/tests`, inalterados — nenhuma regra de transformação
  mudou, só o intervalo de competências solicitadas).
- TypeScript: `packages/db` 68/68, `packages/risk` 43/43, `apps/api`
  34/34 (32 pré-existentes + 2 novos testes de regressão de competência).
- `npm run typecheck`, `npm run lint`, `npm run build`: limpos.

## 9. Pendências

**Bugs.** Nenhum conhecido em aberto após as correções desta fase.

**Limitações metodológicas.** Sem mudança desde a Fase 5 — TENDÊNCIA,
SEVERIDADE, VULNERABILIDADE, segundo limiar de confiabilidade, população
REAL.

**Limitações de fonte externa.**
- Catálogo pysus para SIH/SP descontínuo — causa não determinada.
- CNES/DEMAS sem histórico por competência — bloqueia Pressão Hospitalar
  REAL para qualquer competência que não seja a do mês corrente de
  ingestão, independente de quantos meses de SIH forem cobertos.

**Melhorias futuras.**
- Expandir SIH para outros anos (mesma mecânica, `COMPETENCIAS_POC`).
- Avaliar fonte alternativa de capacidade hospitalar histórica, se
  Pressão Hospitalar REAL for prioridade antes do CNES/DEMAS publicar
  histórico.

## 10. Próximo passo recomendado

Não avançar para cruzamento SIH×CNES real (bloqueado por fonte, seção 5).
Próximo passo de maior valor: população REAL (IBGE Censo 2022), que já tem
fonte identificada (Fase 5) e destrava taxa de internação por 10k
habitantes REAL — componente TENDÊNCIA simples, sem depender do CNES.
