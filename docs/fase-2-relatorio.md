# Fase 2 — Relatório de Implementação

## 1. Status

**CONCLUÍDA** (parcial, por lacuna metodológica documentada — não por falha de implementação)

## 2. Objetivo

Transformar os dados `gold` da Fase 1 em componentes de risco e score
materializados: `dados gold → indicadores → normalização → confiabilidade →
RiskComponenteValor → RiskScore → classificação`. Motor isolado em
`packages/risk` (puro, sem Prisma/HTTP/SQL); orquestração em `packages/db`;
nenhuma lógica matemática em `apps/api` ou `apps/web` (nenhum dos dois foi
tocado nesta fase).

## 3. Componentes implementados

### Pressão Hospitalar

**Completo.** Fórmula exatamente conforme `docs/risk-methodology.md` #2.1:
`pacientesDia / (leitosSus × diasNoMes)`, eixo internação, natureza sempre
`ESTIMATIVA`. Fica `disponivel=false` quando `pacientesDia` agregado do
município+competência inclui qualquer célula suprimida (n<5) ou quando
`leitosSus` total é zero (evita divisão por zero). Lacuna de **dado**, não de
fórmula, herdada da Fase 1: o schema não segrega capacidade de leitos por
habilitação oncológica, então o denominador usa o total de leitos SUS do
município, não um subconjunto "oncológico" (registrado desde
`docs/known-limitations.md` da Fase 1).

### Tendência

**Estruturalmente pronta, sempre indisponível.** `docs/risk-methodology.md`
nomeia o indicador ("variação da taxa por 10 mil habitantes em janela móvel,
com tratamento de sazonalidade") mas nunca definiu o tamanho da janela nem o
método de sazonalidade — calcular isso seria inventar metodologia. A base
DEMO (6 competências de um único ano) também não permite detectar
sazonalidade de forma significativa. **O que É computável e foi
implementado**: a taxa de internação por 10.000 habitantes em si (sem a
variação), materializada como `IndicadorMunicipal` via um `IndicadorDefinicao`
real (`TAXA_INTERNACAO_10K_HAB`, natureza `OBSERVADO`, eixo `RESIDENCIA`,
direção `MAIOR_PIOR` — vinda do banco, não hardcoded).

### Severidade

**Estruturalmente pronta, sempre indisponível.** Os 3 sub-indicadores
(permanência média, proporção de diárias de UTI, letalidade hospitalar)
estão implementados e testados individualmente
(`packages/risk/src/components/severidade.ts`), mas a documentação nunca
definiu pesos nem fórmula para combiná-los num único valor — diferente do
índice final do Radar, que tem `RiskConfig`/`RiskConfigComponente` como
mecanismo explícito de pesos. Inventar essa combinação seria inventar
critério clínico de gravidade, proibido explicitamente.

### Vulnerabilidade

**Comportamento documentado desde a Fase 0, confirmado.** Arquitetura
pluggável implementada e testada (aceita um valor já resolvido via
`IndicadorDefinicao`), mas nenhuma `RiskConfigComponente` desta fase aponta
`indicadorDefinicaoId` para vulnerabilidade — fonte segue não definida, como
sempre esteve previsto. Nenhuma fonte socioeconômica foi inventada.

## 4. Fórmulas utilizadas

Apenas as realmente definidas nos documentos:

- **Pressão Hospitalar Estimada**: `pacientesDia / (leitosSus × diasNoMes)` (`docs/risk-methodology.md` #2.1).
- **Normalização**: percentil dentro da coorte, com empates por rank médio (`docs/risk-methodology.md` #3; tratamento de empate é decisão de implementação, não documentada, necessária para determinismo).
- **Composição**: soma ponderada dos componentes normalizados, pesos de `RiskConfig`, renormalizados sobre os componentes disponíveis (`docs/risk-methodology.md` #4 e #2.4).

Não implementadas por ausência de definição (ver seção 15).

## 5. Normalização

`packages/risk/src/normalization.ts` — percentil por rank dentro da coorte
(município×competência com o componente disponível), direção
(`MAIOR_PIOR`/`MENOR_PIOR`) respeitada via parâmetro, nunca hardcoded fora
desse módulo. Coortes degeneradas (0 ou 1 item) tratadas explicitamente
(convenção de implementação: percentil neutro 0.5 para coorte de 1).

## 6. Confiabilidade

`packages/risk/src/reliability.ts` — `ALTA`/`BAIXA` conforme
`RiskConfig.limiarVolumeMinimo`. **Nunca retorna `MEDIA`**: a metodologia só
define o corte de `BAIXA`, não um segundo limiar. Confiabilidade do
`RiskScore` agregado = a pior entre os componentes contribuintes (decisão de
implementação, documentada no código, não na metodologia).

## 7. RiskConfig

Duas configs DEMO semeadas (`packages/db/src/scripts/seed-demo.ts`),
`oficial=false`, pesos **iguais** (0.25 por componente — nenhum valor
demonstrativo estava disponível para reutilizar; peso igual é a única
distribuição que não expressa julgamento de importância relativa),
diferindo apenas em `limiarVolumeMinimo` (30 e 100), para demonstrar
versionamento sem sobrescrita. A `RiskConfig` da Fase 1 (`autor=seed-fase1`,
sem componentes) permanece intocada.

## 8. RiskScore

`indice`, `classificacao`, `confiabilidade`, `natureza`, `origem` calculados
por `packages/risk/src/score.ts` e persistidos via
`packages/db/src/repositories/risk.ts`. Classificação em quintis relativos
da coorte — **provisória, não confirmada como método oficial** (ver seção
15). Determinismo e idempotência comprovados por teste automatizado (seção
13/14).

## 9. Supressão

Regra `NULL ≠ 0` respeitada estruturalmente: a agregação de
`FatoInternacaoLocal`/`FatoInternacaoResidencia` por município+competência
usa `bool_or(suprimido)` no SQL — se qualquer célula contribuinte estiver
suprimida, o agregado inteiro vira `NULL` (nunca a soma parcial das células
visíveis, que subestimaria silenciosamente o total). O componente
correspondente fica `disponivel=false`. Não foi implementada agregação de
filtros combinados nem mascaramento de totais na API — isso continua
pertencendo à Fase 3.

## 10. Dados DEMO utilizados

`INCIDENCIA_BASE_MENSAL` do seed da Fase 1 foi ajustada (0.00035 → 0.0011)
para que municípios maiores tivessem, em algumas competências, todas as
células de faixa/sexo acima do limiar de supressão — sem isso não havia como
demonstrar honestamente um município com Pressão Hospitalar disponível.
Municípios pequenos (Borá, Águas de São Pedro) continuam suprimidos na
maioria/totalidade das células mesmo após o ajuste.

## 11. Testes unitários

`packages/risk` — 43 testes, todos passando:

| Teste | Resultado |
|---|---|
| `normalization.test.ts` (7 casos: vazio, 1 item, empates, MAIOR_PIOR, MENOR_PIOR, conjunto pequeno, determinismo) | ✅ |
| `reliability.test.ts` (5 casos: abaixo/igual/acima do limiar, volume zero, nunca MEDIA) | ✅ |
| `components.test.ts` (19 casos: Pressão válida/suprimida/leitos=0/baixa confiabilidade; Tendência sempre indisponível + taxa/10k válida/suprimida/população zero; Severidade sempre indisponível + 3 sub-indicadores válidos/nulos/divisão por zero; Vulnerabilidade indisponível/disponível) | ✅ |
| `score.test.ts` (12 casos: normalização em coorte, renormalização de peso, score indisponível, pesos diferentes, confiabilidade pior-caso, natureza mista, determinismo, configs diferentes, classificação por quintil) | ✅ |

## 12. Testes de integração

`packages/db` — 16 testes novos (`fase2.test.ts`) + 11 da Fase 1
(`fase1.test.ts`), todos passando, rodando contra o Postgres local
com seed + cálculo já executados:

- RiskComponenteValor: 4 componentes presentes, FKs sem órfãos, origem
  sempre DEMO, natureza reflete o componente (não é valor fixo), unique
  constraint rejeita duplicata, Pressão indisponível nunca tem valorBruto,
  Tendência/Severidade sempre indisponíveis.
- RiskScore: campos obrigatórios presentes, índice em [0,1], classificação
  válida, FKs sem órfãos, origem DEMO, 2 RiskConfig distintas geraram
  histórico, unique constraint rejeita duplicata, config da Fase 1 (sem
  componentes) não gerou score.
- Idempotência: recalcular não duplica linhas (verificado executando
  `calculate-risk` de novo dentro do próprio teste).
- IndicadorMunicipal: grão anual respeitado (nunca mais de 1 linha por
  município+ano+indicador), natureza vem de `IndicadorDefinicao`.

## 13. Determinismo

Comprovado empiricamente, não só por design: banco truncado e recriado do
zero (`migrate` + `seed` + `calculate-risk`) duas vezes, checksums
(contagem de linhas, soma de `valorBruto`, soma de `indice`) idênticos nas
duas rodadas (720 `RiskComponenteValor`, 24 `RiskScore`, soma de índice =
12.0 em ambas).

## 14. Idempotência

`calculate-risk` executado duas vezes seguidas sobre a mesma base: contagens
idênticas (nenhuma duplicação), via `upsert` sobre a chave de grão de cada
tabela — mesmo padrão já validado na Fase 1. Coberto por teste automatizado.

## 15. Limitações metodológicas

Lacunas genuínas nos documentos, não resolvidas por invenção (todas também
registradas em `docs/known-limitations.md` e `docs/risk-methodology.md`):

1. **Janela móvel e tratamento de sazonalidade de TENDÊNCIA** — não
   definidos. Sem eles, o componente não pode ser calculado honestamente.
2. **Fórmula/pesos de composição de SEVERIDADE** — os 3 sub-indicadores são
   nomeados, a combinação não é. Sem ela, o componente não pode ser
   calculado honestamente.
3. **Método de classificação em faixas** — `docs/risk-methodology.md` deixa
   em aberto entre quintis relativos e cortes absolutos fixos ("decisão
   necessária antes da Fase 2", nunca tomada). Implementado como quintis,
   **provisório, não confirmado**.
4. **Segundo limiar de confiabilidade** — só `BAIXA` está definido; `MEDIA`
   nunca é produzida por falta de um segundo corte documentado.
5. **Fonte de VULNERABILIDADE** — inalterada desde a Fase 0, decisão adiada
   pelo próprio projeto.
6. **Pesos de `RiskConfig`** — iguais (0.25), DEMO/não-oficiais, escolhidos
   assim por não haver valor demonstrativo documentado a reutilizar.
7. **Denominador de Pressão Hospitalar** — usa leitos totais do município,
   não leitos "oncológicos" (schema não segrega por especialidade, lacuna
   herdada da Fase 1).

Nenhuma dessas lacunas foi preenchida com valor inventado. Onde a
metodologia não determina o cálculo, o componente fica estruturalmente
pronto e explicitamente `disponivel=false`, nunca um número simulado.

## 16. Arquivos alterados

**Novos:**
- `packages/risk/src/types.ts`, `normalization.ts`, `reliability.ts`, `score.ts`
- `packages/risk/src/components/{pressaoHospitalar,tendencia,severidade,vulnerabilidade}.ts`
- `packages/risk/src/__tests__/{normalization,reliability,components,score}.test.ts`
- `packages/db/src/repositories/risk.ts`
- `packages/db/src/scripts/calculate-risk-demo.ts`
- `packages/db/src/__tests__/fase2.test.ts`
- `docs/fase-2-relatorio.md` (este arquivo)

**Modificados:**
- `packages/risk/src/index.ts` (exports reais, substitui `RISK_ENGINE_STATUS`)
- `packages/risk/package.json` (script `test`, devDependency `vitest`)
- `packages/db/src/index.ts` (exporta o repositório de risco)
- `packages/db/src/scripts/seed-demo.ts` (incidência ajustada; 2 RiskConfig + RiskConfigComponente + 1 IndicadorDefinicao adicionados)
- `packages/db/package.json` (script `calculate-risk`, dependency `@healthmap/risk`)
- `package.json` (raiz — script `db:calculate-risk`)
- `package-lock.json`
- `docs/risk-methodology.md`, `docs/data-model.md`, `docs/known-limitations.md`, `docs/roadmap.md`, `CLAUDE.md`

Nenhum arquivo de `apps/web`, `apps/api`, `packages/contracts` ou `etl/` foi
alterado.

**Nota arquitetural a registrar**: `packages/db` passou a depender de
`@healthmap/risk` (para o script de orquestração `calculate-risk-demo.ts`).
`docs/architecture.md` desenha o fluxo com `apps/api` chamando `packages/db`
e `packages/risk` separadamente (API como orquestradora). Como esta fase
não deveria tocar `apps/api`, a orquestração ficou temporariamente em
`packages/db`, como harness de teste interno da Fase 2 — não como o padrão
definitivo. Recomenda-se que a orquestração real da Fase 3 viva em
`apps/api`, chamando `packages/db` e `packages/risk` diretamente, conforme o
diagrama original.

## 17. O que NÃO foi implementado

Pertence explicitamente a fases seguintes:

- **Fase 3** — endpoints da API analítica, envelope de proveniência via
  HTTP, reaplicação de supressão sobre agregações/filtros combinados.
- **Fase 4** — dashboard, visualização do Radar, qualquer UI.
- **Fase 5** — ingestão real, definição real de janela/sazonalidade de
  TENDÊNCIA e composição de SEVERIDADE (quando/se decididas), fonte de
  VULNERABILIDADE.
- **Fase 6** — autenticação, RBAC funcional.
- **Fase 7** — calibração de pesos oficiais, confirmação do método de
  classificação.

Nenhum endpoint de produção foi criado. Nenhuma UI foi tocada. Nenhuma
autenticação foi implementada.

## 18. Próximo passo

A Fase 3 (API) está pronta para ser iniciada — o motor e os dados que ela
vai expor existem, estão testados e documentados, incluindo quais
componentes do Radar ainda não produzem valor e por quê.
