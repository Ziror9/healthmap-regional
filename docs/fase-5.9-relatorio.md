# Fase 5.9 — Real-first + limpeza analítica

> Nota de numeração: esta fase foi pedida como "5.8", mas 5.8 já estava
> ocupada pelo fluxo assistencial (`docs/fase-5.8-relatorio.md`). Registrada
> como 5.9 para não sobrescrever aquele relatório.

## 1. Objetivo

Orientar o produto por dados REAL e pelas análises com valor analítico real,
sem destruir a infraestrutura DEMO usada em desenvolvimento e testes.

## 2. Auditoria — inventário DEMO

### No banco (o que existe)

| Tabela | REAL | DEMO |
| --- | ---: | ---: |
| `Municipio` | 645 | 15 |
| `RegiaoSaude` | 17 (DRS) | 5 ("ilustrativa") |
| `FatoInternacaoResidencia` | 42.778 | 1.620 |
| `FatoInternacaoLocal` | 14.283 | 1.620 |
| `FatoCapacidadeLeitos` | 4.671 | 360 |
| `FatoObitoResidencia` | 1.287 | 0 |
| `FatoFluxoInternacao` | 3.555 | 0 |
| `RiskComponenteValor` | 30.960 | 1.080 |
| `RiskScore` | 7.740 | 36 |
| `RiskScoreRegional` | 204 | 0 |
| `IndicadorMunicipal` | 1.225 | 1 |

### Onde DEMO aparecia na experiência analítica

| # | Local | Problema | Decisão |
| --- | --- | --- | --- |
| 1 | `/radar` | Resolvia para a competência mais recente com RiskScore — jun/2025, DEMO — e mostrava o "ranking do estado" com **3 municípios sintéticos** | **A** — REAL por padrão |
| 2 | `/municipios` | 645 REAL + 15 DEMO na mesma tabela; 8 DEMO reusam nome real (Campinas, Guarulhos, Santos…), então a busca devolvia homônimos | **A** — REAL por padrão + toggle explícito |
| 3 | Visão Geral · Radar por Região | As 5 regiões "(ilustrativa)" apareciam junto dos 17 DRS oficiais | **A** — filtradas |
| 4 | Visão Geral · mapa | Municípios DEMO na lista do mapa (sem geometria, nunca renderizavam) | **A** — filtrados |
| 5 | `/metodologia` | Afirmava **"Hoje toda a base é DEMO"** e **"A base atual é 100% DEMO"** — factualmente falso desde a Fase 5.3 | **A** — texto corrigido |
| 6 | `/sobre` | "Fase 5 · Dados REAL (parcial) + DEMO"; dizia que o Radar inteiro ainda era DEMO | **A** — texto corrigido |
| 7 | Rodapé da navegação | "Dados REAL e DEMO coexistem" | **A** — reescrito |
| 8 | Filtro de origem (REAL/DEMO/Todas) | — | **D** — mantido: é o mecanismo deliberado de inspeção |
| 9 | Seed DEMO, fixtures, testes | — | **D** — mantidos integralmente |

Nenhum código DEMO foi removido (categoria C: zero itens). A meta era tirar
DEMO da **experiência analítica**, não destruir a infraestrutura.

## 3. RiskScore — auditoria do problema já identificado

**Conclusão: os dados REAL NÃO foram contaminados.**

| riskConfigId | autor | origem | scores | municípios | competências |
| ---: | --- | --- | ---: | ---: | --- |
| 2 | seed-fase2-a | DEMO | 12 | 3 | 2025-01..06 |
| 3 | seed-fase2-b | DEMO | 12 | 3 | 2025-01..06 |
| 4 | fase5.4-real | **REAL** | **7.740** | **645** | **2024-01..12** |
| 4 | fase5.4-real | DEMO | 12 | 3 | 2025-01..06 |

Verificação cruzada município × origem:

```
REAL → município REAL : 7.740
DEMO → município DEMO :    36
(nenhum cruzamento)
```

Os conjuntos são **disjuntos em três eixos** (origem, município,
competência). Não há risco de alteração dos resultados REAL: nenhum score
REAL foi sobrescrito, e a aplicação distingue corretamente as origens.

**Causa raiz** (`packages/db/src/repositories/risk.ts:131`):

```ts
export async function getRiskConfigsFase2(prisma) {
  const configs = await prisma.riskConfig.findMany({
    where: { componentes: { some: {} } },   // ← todas as configs com componentes
```

O nome diz "configs da Fase 2" (as do seed), mas a query retorna **qualquer**
config com componentes — incluindo a `fase5.4-real`, criada depois por
`calculate-risk-real.ts`. Por isso `calculate-risk-demo.ts` escreve scores
DEMO nela.

**Nada foi alterado.** A correção proposta está na seção 7.

## 4. Inventário de indicadores

| Indicador | Fonte | Origem | Período | Disponibilidade | Valor analítico | Onde aparece | Decisão |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RiskScore | packages/risk | REAL | 2024 (12 comp.) | 645/645 | **Alto** — localiza risco, compara municípios | Visão Geral, Radar, Radar Municipal, detalhe | Manter |
| Mortalidade oncológica /10 mil | SIM | REAL | 2024 | 579/645 (89,8%) | **Alto** — desfecho de saúde, comparável | Visão Geral (KPI), Radar Municipal, detalhe | Manter |
| Vulnerabilidade (IPVS) | SEADE | REAL | 2022 | 645/645 | **Alto** — explica desigualdade | Radar Municipal, componente do Radar, detalhe | Manter |
| Fluxo assistencial | SIH | REAL | 2024 | 1.838 pares visíveis | **Alto** — revela polos e dependência territorial | Visão Geral (polos), detalhe | Manter |
| Óbitos oncológicos (bruto) | SIM | REAL | 2023-2024 | 644/643 | **Médio** — insumo; a taxa é mais comparável | Radar Municipal, detalhe | Manter (2º nível) |
| Internações (bruto anual) | SIH | REAL | 2024 | 645 com célula | **Médio** — volume sem denominador | Radar Municipal, detalhe | Manter (2º nível) |
| Pressão Hospitalar Estimada | SIH+CNES | REAL | 2024 | 4 de 12 competências | **Médio** — só existe onde CNES-histórico foi ingerido | Componente do Radar | Manter |
| Taxa de internação /10 mil | SIH+IBGE | REAL(1) + DEMO(1) | 2024/2025 | **1/645** | **Baixo** — supressão célula a célula anula quase tudo | Radar Municipal | **Manter, sinalizado** (ver 7) |
| Tendência | — | — | — | 0 | Indisponível — metodologia nunca definida | Componente do Radar | Manter inerte |
| Severidade | — | — | — | 0 | Indisponível — metodologia nunca definida | Componente do Radar | Manter inerte |

## 5. Mudanças no produto

- **Visão Geral**: mapa e Radar por Região passam a usar só municípios/regiões
  REAL; já era REAL-first desde a Fase 5.8.
- **Radar de Risco**: REAL por padrão; passou a paginar até o fim
  (`getTodosRisk`) — antes lia no máximo 200 dos 645.
- **Municípios**: catálogo REAL por padrão, com checkbox "Incluir 15
  municípios DEMO" (rotulados quando exibidos).
- **Metodologia / Sobre / rodapé**: afirmações falsas corrigidas; a seção de
  limitações passou a listar as limitações **reais e atuais** (Tendência/
  Severidade indisponíveis, cobertura de 1 município da taxa de internação,
  supressão do fluxo, pesos não calibrados) em vez de "a base é 100% DEMO".

Nenhum card novo foi adicionado. Nenhuma funcionalidade foi removida.

## 6. Validação

| Item | Resultado |
| --- | --- |
| Typecheck | limpo |
| Lint | limpo |
| Build | limpo (8 rotas) |
| API | 54/54 |
| DB | 126 passando; 6 falhas pré-existentes de Fase 5.3–5.5, inalteradas |
| Risk | 43/43 |
| ETL (pytest) | 117/117 |
| Browser | `/radar` REAL/dez-2024 com 645; `/municipios` 645 (660 com toggle); Visão Geral sem "ilustrativa"; única ocorrência de "DEMO" é a opção do filtro |

**RiskScore REAL alterado?** NÃO · **RiskConfig alterada?** NÃO · **Pesos
alterados?** NÃO · **Metodologia alterada?** NÃO.

## 7. Pendências que dependem de decisão

1. **Isolamento DEMO/REAL na origem (proposta, não executada).** Restringir
   `getRiskConfigsFase2` às configs do seed (`autor LIKE 'seed-fase2%'`), de
   modo que `calculate-risk-demo.ts` pare de escrever na config REAL. Isso
   **não altera nenhum resultado REAL** — os 7.740 scores REAL não são
   tocados. Porém: (a) exige re-executar `calculate-risk-demo`; (b) as 12
   linhas DEMO já gravadas na config 4 permaneceriam até serem removidas, e
   remover registros exige autorização explícita.
2. **`TAXA_INTERNACAO_10K_HAB` com cobertura de 1/645.** Continua
   selecionável no Radar Municipal e se autodescreve honestamente ("1 de 645
   municípios com dado disponível"). Duas saídas possíveis: aplicar o mesmo
   pivô de grão anual da Fase 5.6 (decisão metodológica) ou retirá-la da
   lista de indicadores. Não decidi sozinho — envolve metodologia.
3. **6 asserções desatualizadas** em `fase5.3/5.4/5.5.test.ts`, pendentes
   desde a auditoria anterior.

## 8. Limitações que permanecem

- A poluição DEMO na config REAL continua no banco (contornada na leitura).
- Pressão Hospitalar Estimada só existe em 4 das 12 competências
  (`ingest_cnes_historico.py` pede 4; SIH pede 12).
- Tendência e Severidade continuam estruturalmente indisponíveis.
- Sem testes automatizados de frontend (`apps/web` não tem framework).
