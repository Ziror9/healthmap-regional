# Fase 5 — Relatório de Implementação

## 1. Objetivo

Transformar o HealthMap Regional de um produto 100% DEMO em um produto que
também ingere e exibe dados REAL rastreáveis, sem quebrar DEMO e sem
inventar dado, fonte, coordenada ou metodologia em nenhum ponto onde a fonte
oficial não estivesse disponível ou acessível neste ambiente.

## 2. Estado inicial (auditoria antes de implementar)

- Fases 0–4 concluídas e validadas: schema, migrations, base DEMO
  determinística, motor de risco, API REST, dashboard navegável — tudo
  100% DEMO, sem nenhuma linha `Origem.REAL` no banco.
- `Municipio.latitude`/`longitude` existiam no schema desde a Fase 1 mas
  sempre `null`; nenhum GeoJSON no repositório; mapa da Visão Geral era um
  painel "indisponível nesta fase" (`docs/known-limitations.md` #9,
  redação da Fase 4).
- `etl/` era um diretório vazio (só README descrevendo o plano da Fase 5).
- Infraestrutura de linhagem (`FonteDados`/`IngestaoExecucao`/
  `QualidadeCheck`) e o enum `Origem.REAL` já existiam no schema desde a
  Fase 1, nunca usados por nenhum pipeline até agora.

## 3. Fontes utilizadas

| Fonte | URL | Organização | Licença | Uso nesta fase |
|---|---|---|---|---|
| IBGE — API de Localidades | `servicodados.ibge.gov.br/api/v1/localidades` | IBGE | Dado público (LAI 12.527/2011) | 645 municípios de SP (código IBGE7/IBGE6, nome) |
| IBGE — API de Malhas | `servicodados.ibge.gov.br/api/v3/malhas` | IBGE | Dado público (LAI 12.527/2011) | GeoJSON da malha territorial de SP (qualidade mínima) |
| SES-SP — Departamentos Regionais de Saúde | `saude3.saude.sp.gov.br/departamentos-regionais-de-saude/regionais-de-saude/` | Secretaria de Estado da Saúde de SP | Dado público (LAI) | 17 DRS oficiais + mapeamento município→DRS (extraído de PDF oficial, referência local versionada) |
| CNES via DEMAS | `apidadosabertos.saude.gov.br` | Ministério da Saúde | Dado público (LAI) | Capacidade de leitos (SUS/total, UTI/OUTRO) + amostra de estabelecimentos |
| SIH/SUS | — | DATASUS | — | **Não ingerido** — bloqueio de ambiente, ver seção 12 |
| IBGE — Censo 2022 (tabela 9514) | — | IBGE | — | **Não ingerido** — investigado, deferido, ver seção 12 |

Nenhuma fonte exigiu autenticação. Todas as URLs, licenças e limitações
completas estão registradas em `meta.FonteDados` (consultável sem olhar
código, `chave` = `IBGE_LOCALIDADES` / `SESSP_DRS` / `CNES_DEMAS`) e
detalhadas nas docstrings dos módulos correspondentes em
`etl/healthmap_etl/sources/`.

## 4. Geografia REAL

`etl/ingest_geografia.py` (idempotente, upsert por chave natural):

1. Busca os 645 municípios de SP na API de Localidades do IBGE.
2. Busca o GeoJSON da malha territorial (qualidade mínima — arquivo final
   ~275 KB em vez de vários MB da qualidade máxima).
3. Calcula um centróide aproximado por município (média dos vértices do
   polígono — **não** o centróide de área exato; documentado como
   aproximação em `centroide_aproximado()`).
4. Carrega o mapeamento código IBGE6 → DRS de
   `etl/reference-data/drs_sp_ibge.csv` (referência local, extraída uma vez
   de um relatório PDF oficial da SES-SP via regex sobre texto bruto —
   `pdfplumber.extract_tables()` truncava/concatenava nomes de DRS longos;
   a extração final usa só código IBGE6 + número do DRS, intactos em
   100% das 645 linhas, e busca o nome canônico do DRS de uma fonte limpa
   separada — procedência completa em `etl/reference-data/README.md`).
5. Roda os checks de qualidade (seção 6) e grava 17 `RegiaoSaude` (código
   `DRS-01`..`DRS-17`) e 645 `Municipio`.

**Join key do GeoJSON:** `feature.properties.codarea` (código IBGE7,
7 dígitos) == `Municipio.codigoIbge7`. Preferido a nome de município
(evita ambiguidade de grafia/acentuação).

**Resultado:** 645/645 municípios carregados, 17/17 DRS carregados, 0
rejeitados. GeoJSON publicado como asset estático em
`apps/web/public/geo/sp-municipios.geojson`, com README próprio
documentando fonte, sistema de coordenadas (WGS84, `[lon, lat]`), join key
e por que não se usou Leaflet.

**Coexistência com DEMO:** os 15 municípios DEMO da Fase 1 usavam prefixo
de código IBGE `35` (a UF real de SP) truncado para 6 dígitos — colidia
com códigos IBGE6 reais (ex.: DEMO Barretos `"3500100"[:6]` colidia com a
Adamantina real `"3500105"[:6]`). Corrigido trocando o prefixo sintético
DEMO para `36` (não é UF válida em nenhum estado brasileiro — garante zero
colisão possível com qualquer código IBGE real, de qualquer estado) em
`packages/db/src/scripts/seed-demo.ts`. Verificado: nenhum `codigoIbge7` ou
`codigoIbge6` duplicado entre as 660 linhas (645 REAL + 15 DEMO) — coberto
por teste automatizado (`fase5.test.ts`).

## 5. CNES: capacidade de leitos e estabelecimentos

`etl/ingest_cnes.py`:

- **Capacidade de leitos** (`FatoCapacidadeLeitos`, `origem=REAL`): busca
  `/assistencia-a-saude/hospitais-e-leitos` para o Brasil inteiro (o filtro
  `uf` da API retorna 500 para qualquer valor — bug real do servidor,
  contornado paginando o Brasil e filtrando client-side), filtra para SP e
  ativos. **Bug real de paginação instável descoberto:** o mesmo hospital
  reaparecia em páginas diferentes com dados idênticos — sem deduplicar,
  27.021 registros brutos de SP infestariam a soma de leitos em ordens de
  grandeza (constatado: ~136 mil leitos de UTI, ~1,65 milhão de "outros" —
  fisicamente impossível). Corrigido deduplicando por `nome + endereço +
  CEP` (a fonte não devolve código CNES neste endpoint) —
  `cnes.deduplicar_hospitais()`, coberto por 5 testes unitários
  (`etl/tests/test_cnes.py`) e registrado como achado de qualidade
  (`hospital_deduplicado_paginacao_instavel`, severidade `ALERTA`).
  Resultado pós-deduplicação: 2.700 hospitais únicos de SP, agregados por
  município em dois `TipoLeito` (`UTI`, `OUTRO` — a fonte não distingue
  `CLINICO`/`CIRURGICO` dentro do total não-UTI, e ratear essa diferença
  exigiria uma premissa não documentada, deliberadamente não feito).
- **Estabelecimentos** (`Estabelecimento`, amostra): busca
  `/cnes/estabelecimentos?codigo_uf=35`, limite real da API de 20
  registros/página — ingerida uma amostra limitada (25 páginas = até 500
  registros), não o catálogo completo de SP. `habilitacaoOncologica` é
  sempre `false` para linhas REAL com o significado explícito de "não
  determinado por esta fonte" (a fonte usada não informa esse campo — nunca
  deve ser lida como "confirmado sem habilitação").
- **Competência:** a fonte não expõe capacidade histórica por competência —
  o snapshot foi anexado a uma `Competencia` criada/reaproveitada para o
  mês corrente da ingestão (`obter_ou_criar_competencia_atual`).

**Resultado:** 754 linhas de `FatoCapacidadeLeitos` REAL (377 municípios,
10.991 leitos de UTI SUS, 157.908 leitos "OUTRO" SUS — total plausível para
o estado, mas **não cross-validado contra uma estatística publicada
independente**, documentado como limitação em vez de apresentado como
número auditado); 500 `Estabelecimento` gravados, 0 rejeitados.

## 6. Qualidade

Checks reutilizáveis em `healthmap_etl/quality.py` (funções puras,
`(bool, str | None)`, cobertas por 25 testes unitários em
`etl/tests/test_quality.py`), classificados por severidade no momento do
registro (`lineage.registrar_qualidade_check`), nunca hardcoded:

| Regra | Severidade | Resultado nesta execução |
|---|---|---|
| `municipio_sem_duplicidade` | BLOQUEANTE | passou (0 duplicatas) |
| `codigo_ibge7_formato_uf` | BLOQUEANTE | passou (645/645 válidos) |
| `municipio_possui_drs` | ALERTA | passou (0 sem DRS) |
| `municipio_possui_centroide` | ALERTA | passou (645/645 com centróide) |
| `hospital_deduplicado_paginacao_instavel` | ALERTA | achado real (24.321 duplicatas removidas — ver seção 5) |
| `hospital_municipio_casado_por_nome` | ALERTA | 8 hospitais sem município casado por nome |
| `leitos_nao_negativo` | BLOQUEANTE | passou (0 valores negativos) |
| `estabelecimento_sem_duplicidade` | BLOQUEANTE | passou (0 código CNES duplicado na amostra) |
| `estabelecimento_codigo_e_municipio_validos` | ALERTA | registrado por linha rejeitada da amostra |

Um check BLOQUEANTE falho aborta a execução inteira (`SystemExit`, com
`IngestaoExecucao.status = 'FALHA'`); um ALERTA é registrado e a execução
continua — nenhuma inconsistência isolada virou erro fatal do pipeline
inteiro, e nenhum check foi promovido/rebaixado de severidade para "passar".

## 7. Proveniência

Toda linha REAL grava `origem='REAL'` e `execucaoId` apontando para uma
`IngestaoExecucao` com `fonteDadosId`, `status`, `versaoPipeline`,
`linhasProcessadas`, `linhasRejeitadas`, `iniciadoEm`/`finalizadoEm` — "de
onde veio este dado" é respondível inteiramente por consulta SQL, sem ler
código do ETL. Verificado por teste automatizado: nenhuma
`FatoCapacidadeLeitos`/`Estabelecimento`/`Municipio` REAL tem
`execucaoId` órfão; nenhuma `IngestaoExecucao` de fonte REAL ficou parada
em `INICIADA`.

`hashInsumos` não foi preenchido nesta fase (as fontes usadas são API REST
sem arquivo de insumo único para hashear, diferente do padrão
arquivo-DBC do SIH) — `competencia`, `versaoPipeline` e timestamps
cobrem a rastreabilidade necessária para REST snapshots.

## 8. Idempotência

Verificada de duas formas complementares:

1. **Estrutural** (mesmo padrão das Fases 1/2): toda tabela REAL tem
   constraint única sobre a chave natural (`codigoIbge7`;
   `municipioInternacaoId+competenciaId+tipoLeito`; `codigoCnes`) — um
   insert duplicado é estruturalmente impossível, provado por teste
   (`.rejects.toThrow()` em `fase5.test.ts`).
2. **Empírica**: `ingest_geografia.py` e `ingest_cnes.py` foram executados
   duas vezes cada, de ponta a ponta, contra o Postgres real — contagens
   idênticas na segunda execução (645/17 municípios/DRS; 754 linhas de
   leitos, 500 estabelecimentos), confirmadas por contagem direta no banco
   (não só pelo log do próprio script).

## 9. Correção de regressão: `calculate-risk-demo.ts`

Ao rodar a suíte completa após a ingestão REAL, o teste de idempotência da
Fase 2 (`recalcular não duplica linhas`) passou de ~1s para **timeout em
30s**. Causa raiz: `getMunicipios(prisma)` (usado por
`calculate-risk-demo.ts`) não filtrava por origem — depois da Fase 5 a
tabela `Municipio` tem 660 linhas (645 REAL + 15 DEMO) em vez de 15, então
o script passou a computar Radar para **todos os 645 municípios REAL
também**, e pior: gravava `RiskComponenteValor`/`RiskScore` com
`origem: 'DEMO'` para municípios que nunca fizeram parte do seed —
violação direta da regra de nunca misturar DEMO e REAL.

**Correção:** `getMunicipios` ganhou um parâmetro opcional `{ apenasDemo:
true }` que filtra por `codigoIbge7` prefixo `36` (`packages/db/src/
repositories/risk.ts`); `calculate-risk-demo.ts` passou a usá-lo
explicitamente. As 36.120 linhas de `RiskComponenteValor` geradas
incorretamente para municípios REAL antes da correção foram apagadas do
banco; o script foi re-executado e voltou a processar apenas os 15
municípios DEMO (11,7s, `RiskComponenteValor` = 840, `RiskScore` = 24,
0 linhas para municípios REAL — confirmado por query direta).

## 10. API

Nenhuma mudança de contrato foi necessária. `/api/risk` já aceita
`origem=REAL`/`DEMO` desde a Fase 3 (resposta vazia coerente para `REAL`,
já que nenhuma competência tem Radar REAL calculado — comportamento
esperado, não um bug). `/api/municipios` já devolve `origem`-agnóstico
(dimensão, não fato) — passou a devolver naturalmente os 660 municípios
(645 REAL + 15 DEMO) sem nenhuma alteração de código.

## 11. Frontend / Mapa

`apps/web/components/charts/map.tsx` (`MapaSP`): lê o GeoJSON estático
(`/geo/sp-municipios.geojson`), projeta `lon/lat` para SVG com projeção
equiretangular simples (correção de cosseno na longitude), renderiza um
`<path>` por município com tooltip nativo (`<title>`) e navegação por
clique para `/municipios/[id]`. Integrado à Visão Geral
(`apps/web/app/page.tsx`), substituindo o painel "mapa indisponível" da
Fase 4. **Honestidade de estado:** a maior parte dos 645 municípios REAL
aparece sem classificação de risco (cor neutra, tooltip "sem índice REAL
calculado") — o mapa mostra geografia real, não Radar real, e o texto ao
lado do mapa e o `EmptyState` do filtro padrão deixam isso explícito. Sem
Leaflet/dependência nova, consistente com o padrão de `LineChart` da
Fase 4.

Regressão descoberta e corrigida durante a verificação ao vivo: criar uma
`Competencia` nova para o snapshot de leitos do CNES fez a resolução de
"competência mais recente" da API (Fase 3, comportamento intencional, não
alterado) passar a apontar por padrão para essa competência sem nenhum
`RiskScore` — a Visão Geral sem filtro explícito mostrava um `EmptyState`
sem explicação suficiente. Corrigido só no texto do `EmptyState`
(`apps/web/app/page.tsx`), orientando o usuário a selecionar uma
competência de jan–jun/2025 para ver o Radar DEMO — decisão deliberada de
não alterar o contrato de resolução de filtros já testado da Fase 3.

## 12. Limitações

**Resolvido na Fase 5:**
- Geografia oficial completa (645 municípios, códigos IBGE reais, 17 DRS
  reais) substituindo a base sintética da Fase 1.
- GeoJSON oficial e mapa geográfico real no frontend.
- Capacidade de leitos REAL (CNES) para 377 municípios de SP.
- Amostra de estabelecimentos REAL (CNES).
- Bug de colisão de código IBGE6 entre DEMO e a futura carga REAL
  (latente desde a Fase 1, só se manifestou ao carregar dado real).
- Bug de escopo em `calculate-risk-demo.ts` (processava municípios REAL
  indevidamente) — latente desde a Fase 2, só se manifestou com a
  geografia REAL da Fase 5.

**Permanece pendente:**
- Taxonomias de `FaixaEtaria`/`TipoLeito` não validadas contra o
  dicionário de dados real do SIH/CNES.
- Segundo limiar de confiabilidade (ALTA/MÉDIA/BAIXA).
- Método de classificação por quintil (provisório desde a Fase 2).

**Bloqueado por fonte externa:**
- **SIH/SUS**: `pysus` exige compilação nativa C (`cffi`/`pyreaddbc`) e
  Microsoft Visual C++ Build Tools, ausentes neste ambiente; sem
  alternativa REST equivalente encontrada. Sem SIH, não há
  `FatoInternacaoResidencia`/`FatoInternacaoLocal` REAL — o Radar de Risco
  continua 100% DEMO.
- **CNES `hospitais-e-leitos`**: filtro `uf` quebrado no servidor (500),
  paginação por offset instável (contornada com deduplicação, ver seção
  5) — limitações do provedor, não deste projeto.
- **CNES `estabelecimentos`**: limite de 20 registros/página torna
  cobertura exaustiva de SP impraticável no tempo desta fase — amostra
  limitada, documentada como tal.

**Bloqueado por metodologia** (sem mudança desde a Fase 0/1/2):
- Fonte do indicador de VULNERABILIDADE.
- Janela móvel/sazonalidade de TENDÊNCIA; fórmula de composição de
  SEVERIDADE.
- Recorte "tipo de leito" vs. "habilitação oncológica" para a Pressão
  Hospitalar Estimada.

Detalhes completos: `docs/known-limitations.md` (seções 2, 9, 10).

## 13. Testes

- **TypeScript** (`npm run test`, `vitest`): **134/134 passando** —
  32 `apps/api`, 59 `packages/db` (11 Fase 1 + 16 Fase 2 + 32 Fase 5 novos),
  43 `packages/risk`. Nenhuma regressão aceita: 3 testes pré-existentes que
  quebraram como consequência direta e esperada de REAL passar a coexistir
  com DEMO na mesma base foram corrigidos (não contornados) para expressar
  a intenção original do teste com a origem certa — ver seção 9 para a
  correção de comportamento associada.
- **Python** (`python -m pytest etl/tests`): **42/42 passando**, 100% sobre
  funções puras (sem rede, sem banco): `test_quality.py` (25 testes dos
  checks de qualidade), `test_cnes.py` (normalização de nome + deduplicação
  de hospitais, incluindo reprodução do bug real de paginação), `test_
  geografia.py` (cálculo de centróide aproximado), `test_geojson_asset.py`
  (estrutura, cobertura de 645 municípios, sem duplicidade, coordenadas em
  WGS84 — contra o arquivo real já publicado, não um fixture sintético).
- **Idempotência**: coberta estruturalmente (constraints únicas + teste de
  rejeição de insert duplicado) e empiricamente (reexecução completa dos
  dois pipelines Python, contagens inalteradas — seção 8).
- `npm run typecheck`, `npm run lint`, `npm run build` — sem erros em
  nenhum workspace. `npm run db:check` — conexão OK.

## 14. Arquivos alterados

**Novos:**
- `etl/healthmap_etl/` (pacote: `db.py`, `lineage.py`, `quality.py`,
  `sources/{ibge,drs_sp,cnes,sih}.py`)
- `etl/ingest_geografia.py`, `etl/ingest_cnes.py`
- `etl/reference-data/` (`drs_sp_ibge.csv` + README)
- `etl/tests/` (`test_quality.py`, `test_cnes.py`, `test_geografia.py`,
  `test_geojson_asset.py`, `conftest.py`)
- `etl/requirements.txt`
- `apps/web/public/geo/` (`sp-municipios.geojson` + README)
- `apps/web/components/charts/map.tsx`
- `packages/db/src/__tests__/fase5.test.ts`

**Modificados:**
- `packages/db/src/scripts/seed-demo.ts` (prefixo IBGE sintético DEMO
  `35`→`36`)
- `packages/db/src/repositories/risk.ts` (`getMunicipios` ganha
  `apenasDemo`)
- `packages/db/src/scripts/calculate-risk-demo.ts` (usa `apenasDemo: true`)
- `packages/db/src/__tests__/fase1.test.ts` (2 asserções escopadas para
  `origem: 'DEMO'` explicitamente)
- `apps/api/src/__tests__/risk.test.ts` (1 teste fixa `competenciaId`
  explícito em vez de depender do default "mais recente")
- `apps/web/app/page.tsx` (integra `MapaSP`, `EmptyState` mais explicativo)
- `apps/web/lib/risk-display.ts` (auditoria: `inferOrigemMunicipio`)
- `apps/web/app/municipios/page.tsx` (auditoria: badge REAL/DEMO por linha)
- `apps/web/app/municipios/[id]/page.tsx` (auditoria: texto "ilustrativo (DEMO)" no cabeçalho)
- `etl/README.md`
- `CLAUDE.md`, `docs/roadmap.md`, `docs/data-model.md`,
  `docs/known-limitations.md` (este documento)

**Sem etl/healthmap_etl/sources/sih.py alterado como implementação** — só
documentação do bloqueio (`NotImplementedError` explícito se chamado).

## 16. Auditoria final independente (pós-implementação)

Depois da implementação original (seções 1–15), uma segunda passada de
auditoria foi feita comparando objetivo original, roadmap, código, banco,
ETL, fontes REAL, GeoJSON, separação DEMO/REAL, frontend, API e testes —
sem reimplementar nada que já funcionava. Método: revalidação direta no
banco (queries independentes das da suíte de testes, não reaproveitando
resultado antigo), recontagem do GeoJSON contra o banco, inspeção de
constraints/índices via `pg_constraint`/`pg_indexes`, e nova rodada completa
de `typecheck`/`lint`/`build`/`test`.

**Confirmado sem regressão, sem necessidade de mudança:** contagens de
municípios/DRS/leitos/estabelecimentos inalteradas; 0 duplicidade de
`codigoIbge7`/`codigoIbge6`/`codigoCnes`; 0 órfão de FK em qualquer tabela
tocada pela Fase 5; 0 mistura de origem por competência em
`FatoCapacidadeLeitos`; 0 `RiskScore`/`RiskComponenteValor` em município
REAL; GeoJSON com 100% de correspondência 1:1 com `Municipio.codigoIbge7`
REAL (645/645, sem sobra de nenhum lado); `FatoCapacidadeLeitos` já tinha
CHECK constraint de não-negatividade a nível de banco desde a Fase 1
(`FatoCapacidadeLeitos_naoNegativo_check`), não só validação de aplicação -
nenhuma constraint faltando foi encontrada.

**Achado novo e corrigido:** 8 dos 15 municípios DEMO ilustrativos
compartilham nome exato com um município REAL (Campinas, Guarulhos,
Sorocaba, Franca, Barretos, Bauru, Presidente Prudente, Santos) - como
`Municipio` não carrega `origem` (só fatos carregam, por design), as duas
linhas apareciam no catálogo/detalhe sem rótulo textual, discrimináveis só
pelo código IBGE. Não era um caso de "DEMO apresentado como REAL" (nenhum
dado errado era mostrado — o `RiskScore` do município DEMO já vinha com
badge "DEMO" corretamente), mas um risco real de confusão de identidade do
município em si. Corrigido com uma inferência 100% client-side a partir de
dado já existente (prefixo do `codigoIbge7`, mesma convenção que
`seed-demo.ts` já usa) — sem alterar API, banco ou contrato. Ver
`apps/web/lib/risk-display.ts` (`inferOrigemMunicipio`),
`apps/web/app/municipios/page.tsx` e
`apps/web/app/municipios/[id]/page.tsx`. Verificado ao vivo no navegador
para o par Campinas DEMO (id 4) / Campinas REAL (id 124): DEMO mostra
badge "DEMO" na listagem e o texto "Município ilustrativo (DEMO)" no
cabeçalho do detalhe; REAL não mostra nenhum rótulo (correto — REAL é o
padrão implícito, sem badge de "verdadeiro" a inventar).

**Idempotência dos pipelines Python:** não reexecutada com chamadas de
rede nesta auditoria (a instrução explícita foi evitar chamada externa
desnecessária quando o resultado já está disponível localmente) - a prova
já é dupla e já registrada nas seções 8/13: estrutural (constraint única +
teste de rejeição de insert duplicado) e empírica (duas execuções
completas de ponta a ponta feitas durante a implementação original,
contagens idênticas, confirmadas por query direta no banco).

**Resultado:** typecheck, lint, build e teste completo (134 TypeScript +
42 Python) voltaram a passar sem nenhuma regressão após a correção.

## 17. SIH/SUS — terceira rodada (dado REAL ingerido)

Depois da auditoria (seção 16), o usuário pediu uma tentativa técnica
agressiva de resolver o bloqueio do SIH — resultado: **implementado**, não
apenas investigado.

**Como o bloqueio foi contornado.** `pyreaddbc` (dependência nativa do
pySUS) não publica wheel para Windows — só sdist, que exige Microsoft
Visual C++ Build Tools. Confirmado nesta sessão que `pyreaddbc` **tem**
wheel pré-compilado para Linux (`manylinux`, cp311). Um container Linux
dedicado (`etl/docker/Dockerfile.sih`, Python 3.11-slim) resolve isso sem
tocar no ambiente principal do host nem no `docker-compose.yml` do projeto
(que continua exclusivo de PostgreSQL+Adminer).

**Descoberta de API real, não documentada no início.** `pysus` 2.8.0 busca
dados de um bucket S3 público ("catálogo DuckLake"), não mais do FTP
histórico do DATASUS. O filtro de alto nível `sih(state=, year=, month=)`
mostrou-se silenciosamente vazio (os campos `group`/`state` do catálogo
estão nulos) — contornado listando arquivos direto pelo `path` (que
codifica grupo/UF/ano/mês), implementado em
`healthmap_etl/sources/sih.py`.

**Execução real.** `docker build -f etl/docker/Dockerfile.sih -t
healthmap-etl-sih .` seguido de `docker run` com `DATABASE_URL` apontando
para `host.docker.internal`. Resultado (SP, competência 2024-02 — única do
período 2024-01/03 solicitado que existia no catálogo espelhado, ver
seção 18): 221.117 registros brutos → 16.020 oncológicos (C00-C97) →
16.016 válidos → 3.467 células `FatoInternacaoResidencia` (591 municípios
distintos) + 1.177 células `FatoInternacaoLocal` (213 municípios
distintos), supressão n<5 aplicada (2.829/710 células suprimidas
respectivamente). Reexecutado duas vezes — contagens idênticas
(idempotência confirmada empiricamente, além da prova estrutural via
constraint única).

**Bug real corrigido durante a implementação.** Cast de enum sem
qualificação de schema (`::"FaixaEtaria"` em vez de `::gold."FaixaEtaria"`)
falhava com `type "FaixaEtaria" does not exist` — Postgres não achava o
tipo no `search_path` padrão. Corrigido qualificando o schema
explicitamente, consistente com o resto do projeto (nenhuma tabela é
referenciada sem schema).

**Regressão real encontrada e corrigida.** Adicionar a competência 2024-02
(mais antiga que as competências DEMO de 2025) quebrou dois testes que
usavam "competência mais antiga"/"competência mais recente" como proxy
para "competência com dado DEMO calculado" — um pressuposto que deixou de
valer. Corrigido substituindo o proxy por uma busca direta (`RiskScore`
com `origem='DEMO'` existente) em `apps/api/src/__tests__/risk.test.ts`, e
recalculando `calculate-risk-demo.ts` (que processa todas as competências
para os municípios DEMO, harmless mesmo para uma competência sem fato DEMO
— gera só componentes "indisponível", nunca dado inventado).

Detalhes metodológicos completos (recorte residência/internação, CID,
sexo/faixa etária, supressão, por que Pressão Hospitalar Estimada REAL
continua indisponível): [`docs/sih-methodology.md`](sih-methodology.md).

## 18. Limitações da implementação SIH

- **Cobertura: 1 competência (POC), não histórico.** O catálogo espelhado
  pelo pySUS para SP/RD não é contínuo (152 arquivos entre 1992-01 e
  2026-02, de até ~408 meses possíveis) — a causa (lacuna real do DATASUS
  vs. espelho incompleto do pySUS) não foi determinada. 2024-01 e 2024-03
  (do período solicitado) estavam ausentes — reportados, não inventados.
- **Pressão Hospitalar Estimada REAL continua indisponível** — SIH
  (2024-02) e CNES (snapshot preso a outra competência) não compartilham
  competência nenhuma. Não é limitação de código — é ausência real de
  sobreposição temporal entre as duas fontes REAL disponíveis, verificada
  em teste automatizado.
- **Totais de leitos REAL (CNES) continuam sem cross-validação externa**
  (já registrado na seção 12) — sem mudança nesta rodada.
- **`UTI_INT_TO` usado para `diariasUti`** (total de diárias de UTI da
  internação, não recortado ao mês corrente) — escolhido para casar com a
  granularidade "por AIH" de `DIAS_PERM`, não validado contra nenhum
  indicador oficial publicado que use exatamente esse campo.

## 19. Próximos passos (Fase 6, não implementada)

- SIH: ampliar cobertura de competências (rodar `etl/ingest_sih.py` de novo
  com mais meses, um a um, conforme existirem no catálogo espelhado) e/ou
  alinhar temporalmente com uma futura captura histórica de leitos do CNES
  — é o que destravaria Pressão Hospitalar Estimada REAL.
- População (Censo 2022, tabela 9514) — fonte já identificada.
- Cobertura completa de `Estabelecimento` (não amostra).
- Autenticação e RBAC efetivo (fora do escopo desta fase por instrução
  explícita).

Esta implementação não avança para a Fase 6 — aguardando autorização.
