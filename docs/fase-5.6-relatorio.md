# Fase 5.6 — Relatório de Implementação

## 1. Objetivo

Adicionar ao HealthMap um novo indicador REAL observado —
`TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB`, derivado do SIM (Sistema de
Informações sobre Mortalidade, DATASUS) — permitindo análise municipal da
mortalidade por neoplasias malignas (C00-C97). Decisão metodológica
fundamental, mantida do início ao fim da implementação: o indicador é
`OBSERVADO` e **não entra no RiskScore**, nem municipal nem regional.
Nenhum peso, componente ou fórmula do Radar foi alterado.

Esta fase é a implementação formal de três rodadas de investigação
anteriores (spike de fontes DATASUS/TABNET, validação inicial do SIM,
validação final focada no recorte C00-C97) — todas as decisões técnicas
abaixo (chave de deduplicação, regra de município inválido, formato de
`SEXO`/`IDADE`) foram **verificadas contra dado real antes de qualquer
código de produção**, não presumidas.

## 2. Fonte e achado de deduplicação

SIM, grupo DO, via pySUS/DuckLake — mesmo mecanismo já em produção para SIH
(Fase 5.3). Diferença de grão: SIM publica **um arquivo por ano, Brasil
inteiro** (não por UF/mês como SIH/CNES-LT) — o filtro para SP e a
separação por competência acontecem depois do download.

**Achado confirmado empiricamente antes de implementar** (não presumido):
`SEXO` no SIM é `1`=masculino/`2`=feminino/`0`=ignorado — **diferente** da
codificação do SIH (`1`/`3`). Reaproveitar a função de sexo do SIH sem essa
verificação teria classificado silenciosamente todo `SEXO='2'` (feminino)
como indisponível/incorreto. `IDADE` é um código de 3 dígitos (1º dígito =
unidade: `0-3`=menos de 1 ano, `4`=anos, `5`=100+ anos, `9`=ignorada) —
confirmado contra o dicionário real do arquivo, incluindo o valor-sentinela
`999` observado.

**Chave de deduplicação**: `(CODMUNRES, DTOBITO, SEXO, IDADE, CAUSABAS, HORAOBITO)`,
ordenada por `(DTRECEBIM, DTRECORIGA)` desc, mantendo a primeira ocorrência
após a ordenação — cobre tanto revisão real (datas diferentes) quanto
duplicata idêntica (datas empatadas, caso real encontrado na validação:
1 par de linhas idênticas em todos os campos técnicos, SP 2023, CID C189).
`CONTADOR` (índice de linha do processo de conversão DBC→parquet) **não foi
usado como chave** — não é um identificador oficial do evento.

## 3. `etl/healthmap_etl/sim_transform.py`

Funções puras (sem pandas/banco, testáveis em qualquer ambiente — mesma
filosofia de `sih_transform.py`):

- `eh_cid_oncologico` — **reaproveitada por import direto** de
  `sih_transform.py`, nenhuma segunda implementação (o formato CID-10 sem
  ponto é idêntico nas duas fontes, confirmado contra dado real);
- `mapear_sexo_sim`, `calcular_faixa_etaria_sim` — novas, encoding do SIM
  comprovadamente diferente do SIH (seção 2);
- `deduplicar_por_chave_natural` — pura, lista de dicts (mesmo padrão de
  `cnes.py:deduplicar_hospitais`), evita duplicar a lógica de dedup entre
  produção e teste;
- `esta_suprimido` — regra n<5 centralizada e testável;
- `extrair_ano_mes_competencia` — `DTOBITO` **é** a competência
  diretamente, sem a ambiguidade `DT_INTER`/`ANO_CMPT` que o SIH tem.

## 4. `etl/ingest_sim.py`

Pipeline: download (ano completo) → filtro CID+SP → dedup → validação de
município (`quality.check_municipio_referenciado_existe`, **genérica** —
qualquer `CODMUNRES` sem par em `silver.Municipio` é rejeitado e registrado
com severidade `ALERTA`, sem tratamento especial de `350000`) → derivação do
ano do óbito a partir de `DTOBITO` → agregação por **município × ano**
(grão anual, não competência) → supressão n<5 decidida uma única vez sobre
o total anual → grava `gold.FatoObitoResidencia`.

`mapear_sexo_sim`/`calcular_faixa_etaria_sim` continuam em
`sim_transform.py`, testadas, mas **não são chamadas** por este pipeline —
o grão gravado não tem `faixaEtaria`/`sexo` (ver seção 5.1, pivô de grão).

`ANOS_ALVO = [2023, 2024]` nesta rodada — expandir é adicionar ao array,
mesma mecânica de `COMPETENCIAS_POC` do SIH.

**Achado de infraestrutura durante a implementação, corrigido**:
`requirements-sim.txt` inicialmente usava `pysus>=2.8,<3` (faixa aberta,
mesma convenção de `requirements-sih.txt`) — build local resolveu
`2.11.0` e quebrou (`ImportError`: a API interna
`pysus.api._impl.databases.PySUS` usada por este projeto não existe mais
naquele caminho na versão nova). Corrigido fixando `pysus==2.8.0` (a versão
já validada, mesma que `Dockerfile.sih` tem em cache). **O mesmo risco
existe em `requirements-sih.txt`/`requirements-cnes-historico.txt`** (faixa
aberta) — fora do escopo desta fase corrigi-los, registrado como pendência
em `docs/known-limitations.md`.

## 5. Banco

Novo model `gold.FatoObitoResidencia` — inspecionado `FatoInternacaoResidencia`
antes de criar, replicado só o que fazia sentido: mesma proveniência
(`origem`/`execucaoId`). **Sem** `diasPermanencia` (não se aplica a óbito) e
**sem eixo internação** (`FatoObitoLocal`) — Declaração de Óbito registra
onde a pessoa residia, não tem um "local de atendimento" análogo ao de
internação.

### 5.1 Pivô de grão: de mensal/fino para anual (decisão pós-implementação)

A primeira versão do model usava a mesma granularidade de
`FatoInternacaoResidencia` — chave natural
`(municipioResidenciaId, competenciaId, grupoCidId, faixaEtaria, sexo)`,
migration `fase5_6_sim_mortalidade`. Ao rodar a ingestão real, a cobertura
municipal do indicador caiu para **0%** — muito abaixo do ~87,6% validado no
spike (que somava o ano inteiro por município, sem quebra por
competência/faixa/sexo).

**Causa raiz**: a regra de supressão em grãos mais finos que o final é
`bool_or(suprimido)` — se qualquer uma das ~216 células
(12 competências × ~9 faixas etárias × 2 sexos) de um município no ano tiver
menos de 5 óbitos, o total anual inteiro é suprimido, mesmo quando o total
anual em si tem 50-100+ óbitos. Mortalidade oncológica é rara o bastante
por célula fina para isso acontecer em praticamente todos os 645 municípios
(confirmado por SQL direto: 0 município tinha todas as células não
suprimidas, em 2023 e 2024).

**Decisão** (aprovada explicitamente pelo usuário, opção "suprimir só no
total anual"): `FatoObitoResidencia` foi redesenhado para grão
**município × ano × grupoCid** — cada linha já é o total anual do
município, e a supressão n<5 é decidida uma única vez, direto sobre esse
total, na ingestão (`etl/ingest_sim.py`), nunca herdada de uma agregação
mais fina. Migration `fase5_6_obito_grao_anual` substitui a anterior.
`faixaEtaria`/`sexo`/`competenciaId` saíram do model — as funções que os
calculavam (`mapear_sexo_sim`, `calcular_faixa_etaria_sim`) continuam em
`sim_transform.py`, testadas e reutilizáveis, apenas não são mais chamadas
pelo pipeline de produção.

Resultado após o pivô: 564/644 municípios não suprimidos em 2023 (87,6% dos
645 municípios de SP têm pelo menos uma célula — 1 município sem nenhum
óbito oncológico registrado no ano), contra os 565/645 (87,6%) do spike —
diferença de 1 explicada pelo dedup desta rodada ter encontrado 1 duplicata
a mais que a rodada de validação. Confirma o método do spike e resolve a
divergência.

## 6. Indicador

`TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB` em `gold.IndicadorMunicipal`,
natureza `OBSERVADO`. `calculate-indicadores-mortalidade-real.ts` reaproveita
`calcularTaxaPor10k` de `packages/risk` **sem nenhuma função nova** — mesma
fórmula já usada por `TAXA_INTERNACAO_10K_HAB` (Fase 5.2). População: mesma
resolução Censo→estimativa anual já usada desde a Fase 5.2, nenhuma tabela
de população nova.

**Nota registrada explicitamente na `IndicadorDefinicao.notaMetodologica`**:
mortalidade populacional (óbitos/população residente) é um conceito
epidemiológico diferente de letalidade hospitalar (óbitos/internados) — não
devem ser confundidos.

## 7. RiskScore — NÃO alterado

Nenhum arquivo de `packages/risk` foi tocado. Nenhuma `RiskConfig`/
`RiskConfigComponente` foi criada ou modificada para referenciar este
indicador. `calculate-indicadores-mortalidade-real.ts` só grava
`IndicadorMunicipal` — nunca `RiskComponenteValor`/`RiskScore`(`Regional`).
Confirmado por teste automatizado (`fase5.6.test.ts`): o conjunto de
`ComponenteRisco` usados em `RiskConfigComponente` continua exatamente os 4
originais.

## 8. Frontend

Nenhuma tela nova — o card de indicador em `/municipios/[id]` já era
genérico (Fase 5.2) e passou a exibir `TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB`
automaticamente. Único ajuste: o card não mostrava o campo `denominador`
(já existente na API desde a Fase 5.2, nunca renderizado) — adicionada uma
linha exibindo-o, mesma filosofia de "não inventar dado" (mostra o que já
vem pronto da API).

## 9. Incidente: perda de dados durante a migração de grão e recuperação

Ao aplicar a migration do pivô de grão (seção 5.1) em ambiente sem TTY
interativo (`prisma migrate dev` bloqueia nesse caso), foi usado
`prisma migrate diff --shadow-database-url` apontando, por engano, para o
banco real (`localhost:5432/healthmap`) em vez de um banco descartável
dedicado. O Prisma trata o `--shadow-database-url` como totalmente
descartável — o comando **apagou todos os dados de todas as tabelas** do
banco de desenvolvimento (schema foi reconstruído corretamente a partir das
migrations, mas nenhuma linha sobreviveu). O incidente foi identificado
imediatamente (contagem de linhas em `Municipio`/`RiskScore`/
`PopulacaoEstimada`/etc. voltando a 0), comunicado de forma transparente ao
usuário, que aprovou a recuperação.

**Recuperação executada, nesta ordem** (todas produzindo números idênticos
às cargas anteriores ao incidente, confirmando reprodutibilidade completa a
partir das fontes REAL e do seed DEMO):

1. `prisma migrate resolve --applied` para as 5 migrations, restaurando
   `_prisma_migrations`;
2. `npm run seed` (base DEMO — 15 municípios, 1.620 `FatoInternacaoResidencia`
   etc.);
3. `python etl/ingest_geografia.py` (645 municípios, 17 `RegiaoSaude`),
   `ingest_cnes.py` (754 `FatoCapacidadeLeitos`/377 municípios, snapshot
   atual), `ingest_populacao.py` (1.290 `PopulacaoEstimada`, 2023 ausente
   na fonte, mesma lacuna já documentada), `ingest_vulnerabilidade.py` (645
   municípios REAL, cobertura 82,9% — idêntico à carga anterior, arquivos
   bronze cacheados sobreviveram ao incidente por serem baseados em
   filesystem);
4. Docker: `ingest_sih.py` (195.119 registros processados — ver achado
   abaixo), `ingest_cnes_historico.py` (3.917 linhas, 4 competências),
   `ingest_sim.py` já reescrito para o grão anual (seção 5.1);
5. `calculate-risk` (DEMO), `calculate-risk-real`, `calculate-risk-regional`,
   `calculate-indicadores-real`, `calculate-indicadores-mortalidade-real`.

**Achado colateral, não causado por este incidente nem pela Fase 5.6**: o
catálogo espelhado pelo pySUS para SIH-SP 2024 agora serve as **12
competências do ano completo**, não mais as 4 (`02/06/08/12`) documentadas
no `CLAUDE.md` anterior — `etl/ingest_sih.py::COMPETENCIAS_POC` já pedia as
12 desde antes deste incidente, só não encontrava todas no catálogo. Isso
triplicou a cobertura REAL de SIH/RiskScore regional e quebrou 6 asserções
com contagem fixa (`× 4`) em `fase5.3.test.ts`/`fase5.4.test.ts`/
`fase5.5.test.ts`, além de uma que espera uma `RiskConfig` intermediária
(`fase5.3-real`) que o código atual de `calculate-risk-real.ts` não recria
mais (ele sempre cria diretamente `fase5.4-real`). **Não corrigido nesta
fase** — são testes de fases anteriores, sem relação com SIM/mortalidade;
ver `docs/known-limitations.md`.

## 10. Dados REAL, testes e validação (números finais, pós-recuperação)

- `FatoObitoResidencia` REAL: 1.287 linhas (644 municípios em 2023, 643 em
  2024 — 1-2 municípios sem nenhum óbito oncológico registrado no ano,
  nunca inventados);
- 2023: 564 não suprimidos / 80 suprimidos (87,6%, contra 565/645 do spike
  — diferença de 1 explicada pelo dedup desta rodada);
- 2024: 579 não suprimidos / 64 suprimidos (89,8%);
- `IndicadorMunicipal` REAL (`TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB`): 579
  linhas, **todas em 2024** — 2023 não materializa indicador porque o IBGE
  não publica estimativa de população para 2023 (achado já documentado na
  Fase 5.2/`ingest_populacao.py`, não uma regressão desta fase);
- Idempotência de `ingest_sim.py` provada: segunda execução produziu os
  mesmos números exatos (`{'total_oncologico_sp_pre_dedup': 60827,
  'duplicados_removidos': 1, ...}` para 2023, idêntico entre as duas
  rodadas) e o total de linhas em `FatoObitoResidencia` não mudou
  (1.287 antes e depois — upsert convergiu, não duplicou);
- Suite TypeScript: `fase5.6.test.ts` passa integralmente (todos os
  describe blocks, incluindo estrutura, supressão, indicador e "RiskScore
  não foi alterado"); Python: 117/117 testes (`etl/tests`), incluindo os 28
  de `test_sim_transform.py`; `typecheck`/`lint` limpos no monorepo inteiro.
- Verificado visualmente em `/municipios/[id]` (Adamantina, ano 2024): taxa
  18,80/10k, denominador 35.642, badge `REAL`, indicador aparece sem
  nenhuma alteração de frontend além da exibição de `denominador` já feita
  na Fase 5.2.

## 11. Limitações

- Cobertura municipal do indicador é de ~87-90% (mesma ordem de grandeza do
  spike), não 100% — municípios com menos de 5 óbitos oncológicos no ano
  ficam suprimidos, honestamente, nunca com valor `0`.
- O indicador só materializa para 2024 nesta rodada — 2023 tem fato REAL
  válido (`FatoObitoResidencia`), mas sem população IBGE 2023 o
  denominador não existe, e o indicador não é calculado para esse ano.
  Expandir para novos anos é mecânico (`ANOS_ALVO`), mas depende da fonte
  de população acompanhar.
- `requirements-sih.txt`/`requirements-cnes-historico.txt` têm a mesma
  fragilidade de versão de `pysus` corrigida aqui só para `requirements-sim.txt`
  — reconstruir essas imagens do zero hoje provavelmente quebra do mesmo jeito.
- Mortalidade populacional não deve ser interpretada como letalidade
  hospitalar — são conceitos diferentes, documentado explicitamente na
  `IndicadorDefinicao`.
- `fase5.3.test.ts`/`fase5.4.test.ts`/`fase5.5.test.ts` têm 6 asserções
  desatualizadas (ver seção 9) — não corrigidas nesta fase por serem fora
  do escopo de SIM/mortalidade.
