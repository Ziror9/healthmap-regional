# Fase 5.10 — Higienização REAL/DEMO + readequação SIH

## 1. Escopo

Três fechamentos técnicos aprovados após a auditoria da Fase 5.9:

1. isolamento correto de `RiskConfig` REAL × DEMO;
2. readequação da agregação SIH para viabilizar `TAXA_INTERNACAO_10K_HAB`;
3. encerramento das 6 asserções antigas das Fases 5.3–5.5.

**Nenhuma metodologia foi alterada.** RiskScore, RiskConfig, pesos,
thresholds, componentes, vulnerabilidade e Pressão Hospitalar Estimada
permanecem idênticos.

---

## 2. Isolamento REAL × DEMO

### Problema

`getRiskConfigsFase2` (`packages/db/src/repositories/risk.ts`) se apresentava
como "as configs da Fase 2" mas filtrava apenas por
`componentes: { some: {} }` — ou seja, **qualquer** config com componentes.
A config `fase5.4-real` (id 4), criada depois por `calculate-risk-real.ts`,
entrava nesse conjunto, e `calculate-risk-demo.ts` gravava linhas DEMO
dentro dela.

### Diagnóstico — os dados REAL não foram contaminados

| riskConfigId | autor | origem | scores | municípios | competências |
| ---: | --- | --- | ---: | ---: | --- |
| 2 | seed-fase2-a | DEMO | 12 | 3 DEMO | 2025-01..06 |
| 3 | seed-fase2-b | DEMO | 12 | 3 DEMO | 2025-01..06 |
| 4 | fase5.4-real | **REAL** | **7.740** | **645 REAL** | **2024-01..12** |
| 4 | fase5.4-real | DEMO | 12 | 3 DEMO | 2025-01..06 |

Verificações executadas antes de qualquer escrita:

```
cruzamento origem × município:  REAL→municípioREAL 7.740 | DEMO→municípioDEMO 36 | cruzados 0
colisões (município,competência) REAL ∩ DEMO na config 4:            0
colisões (município,competência,componente) em RiskComponenteValor:  0
```

Conjuntos disjuntos em três eixos (origem, município, competência). Nenhum
risco de alterar resultado REAL.

### Correção

`getRiskConfigsFase2` passou a recortar por `autor startsWith 'seed-fase2'`
— o mesmo critério que o seed usa para nomear suas configs. Nenhum peso,
componente ou limiar tocado.

**Prova de que funciona:** antes a execução DEMO reportava
`3 RiskConfig(s)`; depois, `2` — e o total de RiskScore DEMO caiu de 36 para
24 (apenas as configs do seed).

### Limpeza direcionada

Executada em transação, com verificação do checksum REAL *dentro* da
transação:

```sql
DELETE FROM gold."RiskComponenteValor" WHERE "riskConfigId"=4 AND origem='DEMO';  -- 360
DELETE FROM gold."RiskScore"           WHERE "riskConfigId"=4 AND origem='DEMO';  --  12
```

| Momento | Checksum RiskScore REAL | Linhas |
| --- | --- | ---: |
| Antes | `4273e1fc64639b05a47c39be95bb8dbf` | 7.740 |
| Depois do DELETE | `4273e1fc64639b05a47c39be95bb8dbf` | 7.740 |
| Depois de re-rodar o DEMO | `4273e1fc64639b05a47c39be95bb8dbf` | 7.740 |
| Depois da re-ingestão SIH | `4273e1fc64639b05a47c39be95bb8dbf` | 7.740 |

**Idêntico em todos os pontos.** DEMO legítimo preservado (24 scores nas
configs do seed); seed, fixtures e testes intactos.

---

## 3. Readequação SIH — `TAXA_INTERNACAO_10K_HAB`

### Auditoria (antes de codificar)

| Item | Achado |
| --- | --- |
| Grão de `FatoInternacaoResidencia` | município × competência × grupoCid × faixaEtária × sexo |
| Onde a supressão acontece | `ingest_sih.py:309`, célula a célula, **antes de gravar** |
| Estado da tabela | 34.868 de 42.778 células suprimidas (81,5%), valor **apagado** |
| Soma do que restou | 126.282 de 195.119 internações — subestimaria 35% sem avisar |
| Dado bruto disponível? | **Sim** — parquet do SIH via pySUS, ETL idempotente |

**Conclusão: não é BLOCKED, mas o total anual não pode ser derivado da
tabela existente** — as células suprimidas foram apagadas, e reconstruí-las
seria imputação. Precisa vir do dado bruto, como a Fase 5.6 fez com o SIM.

### Implementação

- Nova tabela `gold.FatoInternacaoResidenciaAnual`
  (município × ano × grupoCid), migration `fase5_10_internacao_residencia_anual`.
- `ingest_sih.py`: `agregar_residencia_anual()` + `gravar_residencia_anual()`
  — quarta agregação do **mesmo** dataframe `valido`, parciais acumuladas por
  ano e supressão n<5 decidida **uma vez** sobre o total do ano.
- `getAgregadoInternacaoResidenciaAnualDireto()` lê a tabela nova;
  `calculate-indicadores-real.ts` passou a usá-la, **reutilizando
  `calcularTaxaPor10k`** (nenhuma fórmula paralela).
- `radarQuery.ts` alinhado à mesma fonte, para que "internações" signifique o
  mesmo número em todo o produto.

`FatoInternacaoResidencia` **não foi alterada** (segue servindo o recorte
demográfico), nem `FatoFluxoInternacao` (§7 do pedido).

### Cobertura antes × depois

| | Antes | Depois |
| --- | ---: | ---: |
| Municípios com taxa disponível | **1 / 645** | **639 / 645** |
| Municípios suprimidos (n<5) | 644 | 6 |
| Total anual visível | 126.282 | 186.485 |

Distribuição da taxa (por 10 mil hab., 2024): mín **13,0** · mediana **50,6**
· média **54,7** · máx **205,4** · n=639.
Internações por município: mín 5 · mediana 70 · média 292 · máx 43.734.

Os 6 municípios suprimidos continuam suprimidos — a cobertura é a máxima que
os dados sustentam, não um alvo perseguido.

### Coerência com o fluxo (§11)

```
195.119 registros processados
−   8.614 com residência fora de SP (= fluxo_pares_sem_municipio)
= 186.505 base anual  ✓ (as duas agregações partem do mesmo dataframe)
```

Invariante verificado em todos os municípios: **total anual ≥ soma do fluxo
visível**, 0 violações. A diferença é exatamente o volume dos pares
suprimidos (o fluxo suprime por par, o anual por município):

| Município | Anual | Fluxo visível | Pares suprimidos |
| --- | ---: | ---: | ---: |
| Adamantina | 252 | 234 | 8 |
| Barretos | 1.575 | 1.569 | 3 |
| Campinas | 2.969 | 2.953 | 8 |

Nenhum número foi ajustado para "bater" — a diferença é explicada, não
corrigida.

---

## 4. As 6 asserções antigas

Nenhuma foi silenciada com `skip`.

| # | Teste | Motivo da falha | Decisão | Comportamento correto agora testado |
| --- | --- | --- | --- | --- |
| 1 | `fase5.3` · "existe RiskConfig autor fase5.3-real" | Essa config **nunca existiu em nenhum commit** (`git log -p`: `AUTOR_RISK_CONFIG_REAL` sempre foi `fase5.4-real`) | **ATUALIZAR** | Existe **exatamente uma** config REAL, não oficial, com 4 componentes |
| 2 | `fase5.3` · "VULNERABILIDADE sem indicadorDefinicaoId" | Idem | **ATUALIZAR** | VULNERABILIDADE aponta o IPVS quando ele existe; os outros 3 componentes nunca apontam indicador |
| 3 | `fase5.4` · "config anterior não foi alterada" | Idem — não há config anterior | **ATUALIZAR** | "RiskConfig nunca muda após uso" testado de forma observável: uma única config REAL, e **zero linhas DEMO dentro dela** (protege a correção do §2) |
| 4 | `fase5.4` · "VULNERABILIDADE em 645 municípios" | `645 × 4` hardcoded; hoje são 12 competências | **ATUALIZAR** | Esperado derivado do banco (municípios REAL × competências com Radar) — não volta a quebrar |
| 5 | `fase5.4` · "config nova cobre mais que a antiga" | Comparava com a config fantasma | **ATUALIZAR** | O Radar classifica **todos** os municípios em toda competência, apesar de PRESSAO estar indisponível na maioria — prova a renormalização de pesos |
| 6 | `fase5.5` · "VULNERABILIDADE regional" | `17 × 4` hardcoded | **ATUALIZAR** | Esperado derivado do banco, contando só regiões com o componente **disponível** (a tabela tem linha para as 22 regiões, mas o IPVS cobre as 17 REAL) |

Efeitos colaterais da limpeza, também corrigidos:

- `fase1` · contagem de tabelas gold: 15 → **16** (nova tabela anual).
- `risk.test.ts` · "sem filtros … devolve itens": exigia `origem === 'DEMO'`
  — expectativa que **só era verdadeira por causa da poluição**. Agora testa
  o invariante real (origem preenchida e homogênea na lista).
- `risk.test.ts` · "filtra por origem=DEMO": passou a informar também o
  `riskConfigId`, já que o DEMO agora vive apenas nas configs do seed.

---

## 5. Validação

| Item | Resultado |
| --- | --- |
| Typecheck | limpo |
| Lint | limpo |
| Build | limpo |
| API | **54/54** |
| DB | **132/132** (primeira vez 100% verde) |
| Risk | **43/43** |
| ETL (pytest) | **117/117** |
| Browser | Radar Municipal 639/645 em internações e taxa; Visão Geral 645 REAL, sem "ilustrativa", DEMO só no filtro; catálogo 645 + toggle; fluxo intacto (Adamantina 234 visíveis, 8 pares suprimidos); mobile OK |

```
RiskScore REAL alterado?  NÃO  (checksum idêntico em 4 verificações)
RiskConfig alterada?      NÃO
Pesos alterados?          NÃO
Metodologia alterada?     NÃO
Fluxo assistencial alterado? NÃO
```

---

## 6. Limitações remanescentes

- **6 municípios sem taxa de internação** (n<5 no ano) — correto, é a regra
  de privacidade.
- **Pressão Hospitalar Estimada** segue disponível em apenas 4 das 12
  competências: `ingest_cnes_historico.py` pede 4 competências enquanto o SIH
  pede 12. Não tocado nesta fase (alteraria a cobertura de um componente do
  Radar).
- **Tendência e Severidade** continuam estruturalmente indisponíveis.
- **Só 2024** — os anos seguem `COMPETENCIAS_POC` do SIH.
- `getAgregadoInternacaoResidenciaAnual` (método antigo, `bool_or`) foi
  **mantida**: continua correta para o recorte demográfico e ainda é usada
  por `calculate-risk-demo.ts`. Não é código morto.
- Sem testes automatizados de frontend.

## 7. Decisão que ficou em aberto

Quando o cliente pede `origem=DEMO` **sem** informar `riskConfigId`, a API
resolve a config utilizável mais recente (a REAL) e devolve lista vazia —
correto, mas pouco útil. Estender a resolução default de `riskConfig` para
considerar a origem seria uma mudança de comportamento da API; não foi feita
sem autorização.
