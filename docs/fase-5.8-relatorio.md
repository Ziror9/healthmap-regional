# Fase 5.8 — Fluxo assistencial + reestruturação da hierarquia de informação

## 1. Objetivo

Duas entregas conjuntas:

1. **Fluxo assistencial** — responder "para onde os pacientes oncológicos de
   cada município vão se tratar, e quem cada município atende". Nenhum
   dashboard público de SP mostra isso hoje.
2. **Hierarquia de informação** — reorganizar o produto para que a leitura
   siga situação → análise → investigação, em vez de apresentar todos os
   indicadores como igualmente importantes.

## 2. O bloqueio encontrado antes de implementar (e por que exigiu dado novo)

A recomendação inicial afirmava que o fluxo poderia ser derivado do que já
existia. **Estava errado**, e isso foi verificado antes de escrever código:

```
etl/ingest_sih.py::agregar_residencia → groupby(municipio de RESIDENCIA, faixa, sexo)
etl/ingest_sih.py::agregar_local      → groupby(municipio de INTERNACAO, faixa, sexo)
```

São duas distribuições **marginais** do mesmo dataframe. O par ordenado
(origem, destino) é destruído no `groupby`. Saber quantos saem de Adamantina
e quantos entram em Jaú não permite saber quantos foram de Adamantina *para*
Jaú — reconstruir isso exigiria estimativa (modelo gravitacional/IPF), ou
seja, **inventar dado**, proibido pelo `CLAUDE.md`.

Por isso a fase exigiu uma terceira agregação e uma tabela nova. A decisão de
grão e a autorização de re-ingestão foram tomadas pelo usuário antes da
implementação.

## 3. Decisão de grão (aprovada explicitamente)

**Município origem → município destino, grão ANUAL.**

Um par origem→destino num único mês quase sempre tem menos de 5 pacientes; a
supressão n<5 no grão mensal apagaria quase todo o fluxo — a mesma lição do
pivô de grão da Fase 5.6. No grão anual a supressão é decidida **uma única
vez**, sobre o total do par no ano.

Alternativa descartada: destino agregado por DRS teria cobertura quase total,
mas perderia o nome do polo (Barretos, Jaú), que é justamente o valor
analítico.

## 4. Nuance arquitetural: os dois eixos na mesma linha

`gold.FatoFluxoInternacao` é a **única** tabela do projeto que carrega
residência e internação na mesma linha. O invariante #4 do `CLAUDE.md`
("residência e internação nunca se misturam") existe para impedir que um
**número** seja composto misturando os eixos (ex.: taxa por 10 mil habitantes
usando internações por local de atendimento). Aqui os dois eixos permanecem
explícitos, rotulados e **nunca somados entre si** — o par ordenado *é* o
dado. Registrado no comentário do model e neste relatório.

## 5. Implementação

### ETL (`etl/ingest_sih.py`, aditivo)

- `agregar_fluxo()` — terceira agregação do mesmo dataframe bruto `valido`,
  no par (residência, internação). Mesmo padrão já usado quando a Fase 5.5
  acrescentou a agregação regional.
- Parciais por competência acumuladas em memória e somadas por ano depois do
  loop (`fluxo_parciais_por_ano`), para que a supressão seja anual.
- `gravar_fluxo()` — upsert idempotente pela chave natural.
- Par com origem **ou** destino fora dos 645 municípios de SP é excluído
  (quality check `sih_fluxo_par_origem_destino_conhecido`, severidade ALERTA),
  nunca imputado: um fluxo com ponta desconhecida não é interpretável.
- Execução de linhagem própria por ano (sem `competenciaId` — o fato não é de
  uma competência).

### Banco

- `gold.FatoFluxoInternacao`, migration `20260903120000_fase5_8_fluxo_internacao`.
- Chave natural: `(municipioResidenciaId, municipioInternacaoId, ano, grupoCidId)`.
- `internacoes = NULL` quando `suprimido = true`. Nunca 0.

### Leitura (`packages/db/src/repositories/fluxoQuery.ts`)

Segue a separação já existente (`riskQuery.ts`/`radarQuery.ts` servem a API;
`risk.ts` serve ao motor de cálculo). Funções: `getAnosComFluxo`,
`listFluxoPorOrigem`, `listFluxoPorDestino`, `getResumoFluxoMunicipio`,
`listPolosAtendimento`.

### API

- `GET /api/fluxo/polos?ano=&limite=` — polos que mais recebem de fora.
- `GET /api/fluxo/municipios/:id?ano=` — saídas, entradas e resumo.
- `route → controller → service → packages/db`, sem SQL em `apps/api`.
- Ano nunca inventado: omitido resolve para o mais recente disponível;
  inexistente → `404 ANO_NAO_DISPONIVEL`.

### Frontend

- `components/domain/fluxo-panel.tsx` — painel reutilizável.
- Seção "Fluxo assistencial" em `/municipios/[id]` (nível investigação).
- Card "Polos de atendimento" na Visão Geral (nível análise).

## 6. Dados carregados (SIH/SUS 2024, C00-C97)

| Métrica | Valor |
| --- | --- |
| Pares origem→destino gravados | 3.555 |
| Pares visíveis (n≥5) | 1.838 |
| Pares suprimidos (n<5) | 1.717 |
| Internações no fluxo visível | 183.193 |
| Municípios de origem | 645 |
| Municípios de destino | 292 |
| Registros com ponta fora de SP (excluídos) | 8.614 |

Demais tabelas do SIH permaneceram **idênticas** após a re-ingestão
(idempotência confirmada célula a célula).

Principais polos (2024):

| Polo | Internações de fora | Municípios de origem |
| --- | ---: | ---: |
| São Paulo | 19.584 | 136 |
| Jaú | 8.186 | 157 |
| Ribeirão Preto | 5.783 | 83 |
| Barretos | 4.908 | 170 |
| Campinas | 4.420 | 71 |
| São José do Rio Preto | 3.958 | 88 |

## 7. Indicador derivado (rotulado como tal)

`taxaFluxoExternoVisivel = internacoesForaDoMunicipio / internacoesVisiveis`

É **derivado**, não observado, e é calculado **apenas sobre o volume
visível** — pares suprimidos ficam fora do numerador e do denominador. A UI
exibe a palavra "DERIVADO" junto do número e informa quantos pares ficaram
suprimidos. `null` (nunca 0) quando não há volume visível: "não dá para
saber" é diferente de "ninguém sai".

## 8. Reestruturação da hierarquia

### Visão Geral (`apps/web/app/page.tsx`)

Reorganizada em três blocos explícitos:

1. **Situação** — faixa de contexto (municípios, origem, competência,
   frescor) + 4 KPIs que respondem perguntas (municípios em risco alto, maior
   mortalidade oncológica com o nome do município, maior polo de atendimento,
   cobertura do indicador de mortalidade) + nota sobre o que continua
   estruturalmente indisponível.
2. **Análise** — "Onde está acontecendo": mapa, polos de atendimento,
   municípios em maior atenção, Radar por Região de Saúde.
3. **Investigação** — cartões de navegação para Radar Municipal, ranking
   completo e Metodologia.

### Navegação

Agrupada nos mesmos três níveis (Situação / Análise / Investigação). A ordem
reflete a sequência de leitura pretendida, não estética.

## 9. Defeitos pré-existentes encontrados e corrigidos

1. **A Visão Geral lia só 200 dos 645 municípios.** `/api/risk` limita
   `pageSize` a 200 e ordena por índice desc; a página tratava isso como se
   fosse o conjunto completo — enviesando todos os KPIs (média, contagem) e
   deixando 445 municípios sem cor no mapa. Corrigido com `getTodosRisk()`,
   que pagina por baixo dos panos (mesmo padrão do `getTodosMunicipios()` já
   existente).
2. **A landing page abria em DEMO com 3 municípios.** Ver seção 10.
3. **Seletor "Configuração" duplicava a mesma config 12 vezes** em
   `/municipios/[id]` (uma por competência), gerando chave React duplicada.
   O seletor escolhe uma *configuração*, não uma competência — passou a
   deduplicar por `riskConfigId`.

## 10. Mudança de comportamento na resolução de filtro (revisar)

**Problema encontrado no banco:** `calculate-risk-demo.ts` grava scores DEMO
para **todas** as RiskConfigs com componentes ativos, inclusive a
`fase5.4-real` (id 4). Resultado: a config REAL tem 7.740 scores REAL (2024) e
12 scores DEMO (2025). Como jun/2025 é posterior a dez/2024, a resolução
default caía numa competência DEMO e a Visão Geral abria mostrando **3
municípios sintéticos** como panorama do estado.

**O que foi alterado:** `getCompetenciaMaisRecenteComRiskScore` passou a
aceitar `origem` opcional, e `risk.service.ts` a repassa **apenas quando o
cliente pede origem explicitamente**. Sem origem explícita, o comportamento
default documentado na Fase 3 permanece idêntico. A Visão Geral passou a
pedir `origem=REAL` por padrão (sobreponível pelo filtro).

Sem isso, pedir `origem=REAL` podia devolver lista vazia mesmo havendo 7.740
scores REAL — comportamento incoerente.

**Não corrigido (precisa de decisão):** a poluição de dados em si. Os 12
scores DEMO na config REAL continuam no banco. Corrigir exige decidir entre
ajustar `calculate-risk-demo.ts` (para usar só configs DEMO) e/ou remover as
linhas — ambos afetam dado existente.

## 11. Validação

- `typecheck`, `lint`, `build`: limpos no monorepo.
- `apps/api`: 54/54 testes (10 novos de fluxo).
- `packages/db`: 126 passando; as mesmas 6 falhas pré-existentes de
  Fase 5.3/5.4/5.5 já diagnosticadas, nenhuma regressão nova.
- Navegador: Visão Geral (645 municípios REAL, dez/2024, KPIs, mapa, polos),
  detalhe de município (fluxo de Adamantina: 234 visíveis, 4 destinos, 8
  pares suprimidos, 86,3% fora do município), responsividade mobile,
  console sem erros.

## 12. Limitações

- Cobertura: 51,7% dos pares ficam suprimidos (n<5), embora representem
  pouco volume — 183.193 das ~195 mil internações estão visíveis.
- Só 2024 (os anos seguem `COMPETENCIAS_POC` do SIH).
- Pares com ponta fora de SP (8.614 registros) ficam fora: pacientes de
  outras UFs ou internados fora do estado não aparecem no fluxo.
- O fluxo é de internação oncológica (C00-C97) pelo SUS — não inclui saúde
  suplementar nem tratamento ambulatorial (quimioterapia/radioterapia
  ambulatorial estão no SIA, não ingerido).
- Sem visualização de mapa de fluxo (linhas origem→destino); a leitura é por
  listas ordenadas.
