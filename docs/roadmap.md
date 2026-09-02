# Roadmap - HealthMap Regional

Cada fase e autonoma, testavel e nao inicia sem aprovacao explicita. Nenhuma
fase comeca antes que a anterior atenda seu criterio de conclusao.

---

## Fase 0 - Fundacao `CONCLUIDA`

**Objetivo.** Preparar uma fundacao limpa, documentada e pronta para
desenvolvimento, sem nenhuma funcionalidade de negocio.

**Entregas.** Monorepo com npm workspaces; TypeScript strict compartilhado;
ESLint e Prettier; Docker Compose com PostgreSQL 16 e Adminer; Prisma conectado;
frontend Next.js com pagina de status; API com `/health` e `/health/ready`;
documentacao inicial; `CLAUDE.md`; ADR-001.

**Dependencias.** Nenhuma.

**Criterio de conclusao.** Docker sobe, PostgreSQL responde, Adminer conecta,
Prisma conecta, frontend e API iniciam, `/health` responde, TypeScript sem erros,
ESLint executa, build do frontend funciona, nenhum segredo versionado.

---

## Fase 1 - Banco + DEMO `CONCLUIDA`

**Objetivo.** Materializar o modelo de dominio e uma base DEMO claramente
identificada.

**Entregas.** Schema Prisma completo (dimensoes, fatos por eixo territorial,
camada de risco estrutural, governanca) nos schemas `silver`/`gold`/`meta`;
migration aplicada com CHECK constraints e indice unico parcial customizados;
gerador DEMO deterministico (`npm run db:seed`) cobrindo 15 municipios
ilustrativos de SP, 6 competencias, populacao, internacoes por residencia e
por local, capacidade de leitos, com supressao n<5 aplicada; entidades de
RBAC criadas e inertes. Detalhes completos em
[`docs/fase-1-relatorio.md`](fase-1-relatorio.md).

**Dependencias.** Fase 0.

**Definicoes resolvidas nesta fase:**
- agrupamento de CID dentro de C00-C97: uma unica linha no MVP
  (`TODAS_NEOPLASIAS_MALIGNAS`), campo `agrupamento` pronto para subdivisao
  futura por topografia;
- limiar de supressao de celulas: `n < 5`, tratado como parametro do gerador/
  ETL (nao embutido em codigo sem documentacao), sujeito a revisao
  metodologica/juridica - ver `docs/known-limitations.md`.

**Definicoes ainda pendentes (nao bloqueiam a Fase 1, ver known-limitations.md):**
- granularidade real de `FaixaEtaria` (decenal usado como taxonomia inicial)
  e de `TipoLeito` (taxonomia simplificada) contra o padrao real do SIH/CNES;
- base geografica completa e oficial (645 municipios de SP) - a Fase 1 usa um
  subconjunto pequeno com codigos IBGE sinteticos, nao a carga oficial
  completa (ver known-limitations.md).

**Criterio de conclusao.** Banco populado e consultavel, com `origem` e
linhagem em toda linha de fato; nenhuma entidade capaz de armazenar dado
individual de paciente. Atingido - ver `docs/fase-1-relatorio.md` para as
validacoes executadas.

---

## Fase 2 - Radar de Risco `CONCLUIDA (parcial - ver limitacoes)`

**Objetivo.** Implementar o motor unico do indice.

**Entregas.** `packages/risk` com normalizacao por percentil, composicao
ponderada com renormalizacao de componente ausente, classificacao por
quintil (provisoria), confiabilidade por volume; duas `RiskConfig` DEMO
semeadas como **nao oficiais** (pesos iguais, `limiarVolumeMinimo`
diferente); materializacao de `RiskComponenteValor` e `RiskScore` sobre a
base DEMO da Fase 1; 43 testes unitarios (packages/risk) + 16 testes de
integracao (packages/db) incluindo casos-limite; `docs/risk-methodology.md`
atualizado marcando o que foi implementado e o que continua em aberto.
Detalhes: [`docs/fase-2-relatorio.md`](fase-2-relatorio.md).

**Dependencias.** Fase 1.

**Definicoes que continuam pendentes** (o motor funciona sem elas, mas 2 dos
4 componentes ficam estruturalmente prontos e sempre indisponiveis por
causa delas - ver `docs/known-limitations.md`):
- janela movel e tratamento de sazonalidade de TENDENCIA;
- formula/pesos de composicao dos 3 sub-indicadores de SEVERIDADE;
- confirmacao do metodo de classificacao (quintis relativos, implementado
  como provisorio, vs. cortes absolutos fixos);
- segundo limiar de confiabilidade para distinguir ALTA de MEDIA;
- fonte do indicador de VULNERABILIDADE (sem mudanca desde a Fase 0/1).

**Criterio de conclusao.** Indice reproduzivel, versionado e auditavel sobre a
base DEMO; recalculo com pesos novos cria linhas novas, nunca sobrescreve.
Atingido para o(s) componente(s) metodologicamente completos
(PRESSAO_HOSPITALAR_ESTIMADA) - determinismo e idempotencia comprovados por
teste automatizado. Os demais componentes nao violam o criterio: ficam
honestamente indisponiveis em vez de produzir um numero inventado.

---

## Fase 3 - API `CONCLUIDA (parcial - ver limitacoes)`

**Objetivo.** Expor os dados analiticos com proveniencia obrigatoria, somente
leitura.

**Entregas.** API REST minima em `apps/api`
(`routes -> controllers -> services -> packages/db`):

- Catalogo: `GET /api/municipios` (+ `/:municipioId`), `/api/regioes`,
  `/api/competencias`, `/api/indicadores` - paginados, com filtros minimos
  (`regiaoSaudeId`, `ano`);
- Radar: `GET /api/risk` (ranking), `/api/risk/:municipioId`,
  `/api/risk/:municipioId/components` - filtros `competenciaId`,
  `riskConfigId`, `origem`;
- Contratos Zod centralizados em `packages/contracts` (paginacao, catalogo
  geografico, competencia, risk, indicador, detalhe de municipio, erro
  padrao); enums `ClassificacaoRisco`/`Confiabilidade`/`ComponenteRisco`/
  `IndicadorDirecao` adicionados ao lado de `Origem`/`Natureza` ja existentes;
- Repositorios de leitura em `packages/db`
  (`repositories/catalog.ts`, `repositories/riskQuery.ts`) - so leem
  `RiskScore`/`RiskComponenteValor`/`IndicadorMunicipal` ja materializados
  pela Fase 2, nenhuma agregacao de fato bruto acontece na Fase 3;
- resolucao documentada dos filtros quando omitidos (competencia mais
  recente; `RiskConfig` oficial ou, na ausencia, a mais recente com
  componentes ativos; origem nao filtrada por padrao, mas a API responde
  `409` se mais de uma origem estiver presente no resultado, em vez de
  misturar REAL/DEMO silenciosamente);
- 32 testes de integracao de `apps/api` contra o PostgreSQL real + 2 testes
  de fronteira arquitetural (nenhum Prisma/SQL em controller; `apps/web` nao
  importa `@healthmap/db` nem `@prisma/client`);
- pagina tecnica de validacao em `apps/web` (`/radar`) consumindo a API real,
  com estados de carregamento/erro/vazio e marcacao DEMO explicita por item.

Detalhes completos: [`docs/fase-3-relatorio.md`](fase-3-relatorio.md).

**Dependencias.** Fases 1 e 2.

**Nao entregue nesta rodada** (fora do pedido explicito desta fase, fica para
depois):

- endpoints de KPI de cabecalho, mapa, serie temporal e pagina de
  metodologia dedicados - a semantica operacional dos KPIs continua
  indefinida;
- camada `policies` (politica de acesso) - API e publica, sem autenticacao,
  ate a Fase 6;
- reaplicacao de supressao sobre agregacoes/combinacoes de filtro: nao foi
  necessaria porque a Fase 3 nao agrega fato bruto (`FatoInternacaoResidencia`/
  `FatoInternacaoLocal`) em nenhum endpoint - so serve resultados ja
  materializados pela Fase 2, onde a regra `NULL != 0` ja foi aplicada
  (`bool_or` no SQL de agregacao). Volta a ser relevante se uma fase futura
  criar um endpoint que agregue fato bruto diretamente;
- endpoint de escrita/administracao de `RiskConfig`.

**Criterio de conclusao.** API tipada, testada e documentada; nenhum endpoint
analitico devolve valor sem indicar origem/natureza. Atingido para o escopo
entregue - ver `docs/fase-3-relatorio.md` para as validacoes executadas.

---

## Fase 4 - Dashboard `CONCLUIDA (parcial - ver limitacoes)`

**Objetivo.** Produto navegavel de ponta a ponta sobre dados DEMO, com
identidade visual propria de plataforma enterprise.

**Entregas.** Design system claro (tokens de superficie, texto, cor
institucional, semanticas e escala de risco em `apps/web/app/globals.css` +
`tailwind.config.ts`); shell de navegacao (sidebar responsiva + cabecalho por
pagina); componentes de dominio reutilizaveis para risco/proveniencia
(`RiskBadge`, `ConfidenceBadge`, `NatureBadge`, `ProvenanceBadge`,
`UnavailableNote`, `FreshnessIndicator`, `KpiCard`, `RiskScaleLegend`,
`FilterBar`, `RiskScorePanel`, `RegionHeatGrid`) e estados
(loading/empty/error); 6 paginas: Visao Geral (KPIs + territorio por Regiao de
Saude), Radar de Risco (ranking ordenavel/filtravel), Municipios (catalogo),
detalhe de municipio (`/municipios/[id]`, com componentes do Radar, serie
temporal e indicadores), Metodologia (IMPLEMENTADO/PROVISORIO/NAO DEFINIDO por
componente, fiel a `docs/risk-methodology.md`) e Sobre; filtros globais
(competencia, origem) sincronizados com a URL; grafico de serie temporal em
SVG proprio (sem dependencia nova). Escala de risco sempre com icone + texto +
nivel numerico, nunca so cor. Detalhes completos:
[`docs/fase-4-relatorio.md`](fase-4-relatorio.md).

**Dependencias.** Fase 3.

**Nao entregue nesta rodada** (bloqueio documentado, nao decisao arbitraria):

- **Mapa de calor geografico (Leaflet + GeoJSON) nao foi implementado.** Nao
  ha GeoJSON oficial dos municipios de SP no repositorio, nem
  `latitude`/`longitude` populados na base DEMO (campos existem no schema
  desde a Fase 1, mas o seed nunca os preencheu) - implementar um mapa
  exigiria inventar coordenadas ou baixar um arquivo externo sem autorizacao
  explicita. Substituido por um agrupamento por Regiao de Saude (dado real)
  na Visao Geral, com o bloqueio explicado na propria tela.
  Ver `docs/known-limitations.md` #9.
- Sem filtros de sexo/faixa etaria/municipio/regiao no `/api/risk` (a API da
  Fase 3 nao os expoe - criar filtros decorativos que nao alteram o dado
  buscado no servidor foi evitado). Filtro de classificacao e regiao existem
  como filtro client-side sobre a lista ja carregada, onde fazia sentido.
  Filtro de RiskConfig tambem nao tem seletor na UI: a Fase 3 nao expoe um
  catalogo de configuracoes disponiveis.
- KPIs de internacoes/obitos nao aparecem - exigiriam um endpoint agregando
  fato bruto, que a Fase 3 deliberadamente nao criou (risco de reabrir o
  problema de supressao em agregacoes combinadas). Os KPIs implementados
  agregam, no navegador, a lista de `RiskScore` ja materializada pela API
  (contagem/media/distribuicao de apresentacao - nenhum indice recalculado).

**Criterio de conclusao.** Fluxo completo navegavel; projecao e estimativa
nunca renderizadas com o mesmo tratamento visual de dado observado. Atingido
para o escopo entregue - ver `docs/fase-4-relatorio.md` para as validacoes
executadas.

---

## Fase 5 - Dados reais `CONCLUIDA (parcial - ver limitacoes)`

**Objetivo.** Substituir gradualmente DEMO por REAL, sem inventar dado,
fonte ou metodologia.

**Entregas.** `etl/` (pacote Python `healthmap_etl`, escreve direto no
Postgres via SQL - ADR-001) com dois pipelines REAL:

- `ingest_geografia.py`: 645 municipios oficiais de SP (API IBGE
  `localidades`) + 17 Departamentos Regionais de Saude (SES-SP, referencia
  local versionada) + GeoJSON oficial da malha territorial (API IBGE
  `malhas`), publicado como asset estatico do frontend
  (`apps/web/public/geo/sp-municipios.geojson`);
- `ingest_cnes.py`: capacidade de leitos SUS/total (`UTI`/`OUTRO`) para
  todos os municipios de SP com hospital cadastrado (via API DEMAS), e uma
  amostra limitada de estabelecimentos;
- linhagem completa (`FonteDados`/`IngestaoExecucao`/`QualidadeCheck`, ja
  existente desde a Fase 1) para toda carga REAL; checks de qualidade
  bloqueante/alerta; upsert idempotente por chave natural;
- mapa geografico real no frontend (SVG proprio, sem Leaflet), substituindo
  o bloqueio da Fase 4;
- `ingest_sih.py` (segunda rodada): internacoes oncologicas REAL do
  SIH/SUS (DATASUS, grupo RD) via pySUS, rodando num container Linux
  dedicado (`etl/docker/Dockerfile.sih`) que contorna o bloqueio de
  compilacao nativa do Windows sem alterar o ambiente principal nem o
  `docker-compose.yml` do projeto. POC controlado: SP, competencia
  2024-02 (unica disponivel no periodo solicitado, 2024-01/03 ausentes no
  catalogo espelhado - reportado, nao inventado). Grava
  `FatoInternacaoResidencia`/`FatoInternacaoLocal` REAL com supressao n<5
  aplicada e proveniencia completa;
- 68 testes de integracao (`packages/db/src/__tests__/fase5.test.ts`,
  geografia+CNES+SIH) + 74 testes unitarios Python (`etl/tests/`) +
  correcao de testes pre-existentes que assumiam ausencia de dado REAL na
  mesma base.

Detalhes completos: [`docs/fase-5-relatorio.md`](fase-5-relatorio.md) e
[`docs/sih-methodology.md`](sih-methodology.md).

**Dependencias.** Fases 1 a 4.

**Nao entregue nesta rodada** (bloqueio real documentado ou decisao
metodologica explicita, nao decisao arbitraria - ver
`docs/known-limitations.md` #10):

- **Pressao Hospitalar Estimada REAL continua indisponivel** mesmo com SIH
  ingerido - as duas fontes REAL de que o componente precisa (SIH,
  competencia 2024-02; CNES, snapshot preso a outra competencia) nao
  compartilham nenhuma competencia em comum, uma incompatibilidade
  temporal real, nao uma limitacao de codigo (`docs/sih-methodology.md` §9).
- **SIH cobre so 1 competencia** (POC) - o catalogo espelhado pelo pySUS
  para SP/RD nao e continuo (152/~408 meses possiveis entre 1992-2026);
  ampliar a cobertura e so rodar `etl/ingest_sih.py` de novo com mais
  competencias, uma por uma, conforme forem existindo no catalogo.
- **Populacao (IBGE, Censo 2022) investigada, fonte identificada, nao
  implementada** por tempo - taxa de internacao por 10k habitantes REAL
  depende dela, mesmo com `FatoInternacaoResidencia` REAL agora existindo.
- **CNES `estabelecimentos` ingerido como amostra**, nao cobertura completa
  de SP (limite real da API: 20 registros/pagina).
- Indicador de vulnerabilidade social e ativacao do quarto componente do
  Radar seguem sem fonte definida (nao mudou desde a Fase 0/1).

**Criterio de conclusao.** Primeira competencia REAL carregada e visivel,
convivendo com DEMO sem mistura silenciosa. Atingido para geografia,
capacidade de leitos e internacoes oncologicas (visiveis no mapa, no
catalogo de municipios e na base, com proveniencia REAL correta em toda
linha) - o Radar de Risco em si (indice calculado) continua sem nenhuma
competencia REAL, por uma incompatibilidade temporal entre fontes REAL
documentada acima, nao por ausencia de dado.

---

## Fase 5.1 - Expansao SIH 2024 + integridade temporal `CONCLUIDA (parcial - ver limitacoes)`

**Objetivo.** Expandir a ingestao REAL do SIH/SUS para o ano de 2024 inteiro
e garantir que a competencia selecionada pelo usuario seja respeitada em
toda a cadeia (API + frontend), sem troca silenciosa.

**Entregas.**

- `etl/ingest_sih.py`: `COMPETENCIAS_POC` ampliado de 3 para as 12
  competencias de 2024; do catalogo espelhado pelo pysus, so 4 existiam
  (2024-02, 06, 08, 12) - as demais 8 foram reportadas como ausentes, nunca
  inventadas. Idempotencia comprovada por execucao dupla completa: mesmas
  contagens e somas antes/depois, `IngestaoExecucao` cresce a cada execucao
  (trilha de auditoria), fatos gold nao duplicam;
- Matriz de sobreposicao SIH x CNES por competencia
  (`docs/sih-methodology.md` §11.2): nenhuma das 4 competencias SIH REAL
  tem CNES REAL na mesma competencia - limitacao estrutural da fonte
  CNES/DEMAS (sem historico por competencia), nao pendencia de ingestao;
- Correcao de bug pre-existente (achado na auditoria desta fase, nao
  introduzido por ela): `/api/risk` sem filtro resolvia a competencia mais
  recente por data pura, que podia ser uma competencia so-geografica/de
  capacidade sem nenhum RiskScore - Radar abria vazio por padrao. Corrigido
  para resolver a mais recente **com RiskScore** para o riskConfig
  resolvido (`packages/db/src/repositories/riskQuery.ts:getCompetenciaMaisRecenteComRiskScore`);
- Correcao de bug pre-existente no frontend: `/municipios/[id]` ignorava a
  competencia selecionada em `/`/`/radar` e sempre mostrava o RiskScore mais
  recente do municipio. Corrigido com propagacao da competencia/origem via
  URL (`buildMunicipioHref`) e leitura desses parametros no detalhe do
  municipio, com estado honesto "sem dados para esta competencia" (nunca
  substituicao silenciosa) quando a competencia selecionada nao tem
  RiskScore para aquele municipio especifico;
- `FilterBar` (competencia/origem) adicionado tambem a `/municipios/[id]` -
  mesmo mecanismo global ja usado em `/` e `/radar`, sem duplicar filtro;
- Historico do indice (grafico de serie temporal) agora destaca visualmente
  o ponto da competencia selecionada, distinto do restante do historico;
- 2 testes de regressao de API (`apps/api/src/__tests__/municipios.test.ts`)
  provando que `competenciaId` explicito nunca retorna risco de outra
  competencia, e que uma competencia sem RiskScore para o municipio
  devolve lista vazia, nunca substituida.

Detalhes completos: [`docs/fase-5.1-relatorio.md`](fase-5.1-relatorio.md) e
[`docs/sih-methodology.md`](sih-methodology.md) §11.

**Dependencias.** Fase 5.

**Nao entregue nesta rodada:**

- **Pressao Hospitalar Estimada REAL continua indisponivel** - ver matriz
  de sobreposicao acima. So deixa de valer se o CNES/DEMAS publicar
  historico por competencia, ou se uma fonte REAL alternativa de
  capacidade hospitalar historica for adotada - nenhuma das duas existe
  hoje.
- **Cobertura SIH alem de 2024 nao expandida** - o catalogo espelhado tem
  lacunas conhecidas em outros anos tambem (ver `docs/sih-methodology.md`
  §8); expandir exige rodar `etl/ingest_sih.py` ano a ano.
- Populacao REAL, vulnerabilidade, tendencia/severidade: sem mudanca desde
  a Fase 5.

**Criterio de conclusao.** Competencia selecionada e respeitada em toda a
cadeia, sem fallback silencioso; SIH REAL cobre todo o catalogo disponivel
de 2024; ausencia de dado documentada, nao inventada. Atingido para o
escopo entregue.

---

## Fase 5.2 - Populacao REAL + TAXA_INTERNACAO_10K_HAB `CONCLUIDA (parcial - ver limitacoes)`

**Objetivo.** Ingerir populacao REAL (IBGE) para calcular o primeiro
indicador REAL que nao depende do CNES - `TAXA_INTERNACAO_10K_HAB`, ja
definido desde a Fase 2, sempre calculado so para DEMO ate aqui.

**Entregas.**

- `gold.PopulacaoEstimada` (nova, migration `fase5_2_populacao_estimada`) -
  populacao TOTAL anual por municipio (IBGE, tabela SIDRA 6579), separada de
  `Populacao` (grao censitario, faixaEtaria/sexo) porque a fonte anual so
  publica o total, sem quebra - nunca preenchida com uma distribuicao
  inventada;
- `etl/ingest_populacao.py`: 645 municipios x 2024/2025 (1.290 linhas REAL,
  idempotente, ambos os anos disponiveis na fonte no periodo solicitado);
- `calculate-indicadores-real.ts`: reaproveita `calcularTaxaPor10k`
  (`packages/risk`, mesma formula do DEMO, nenhuma segunda implementacao) e
  materializa `IndicadorMunicipal` REAL - `denominador` (campo do schema
  desde a Fase 1, nunca antes preenchido) passa a ser gravado;
- nenhuma mudanca de API, contrato ou frontend foi necessaria - a cadeia
  ja era generica o suficiente para o indicador aparecer sozinho no detalhe
  do municipio;
- 7 testes Python (parsing puro) + 10 testes de integracao TypeScript
  (`packages/db/src/__tests__/fase5.2.test.ts`).

Detalhes completos: [`docs/fase-5.2-relatorio.md`](fase-5.2-relatorio.md).

**Dependencias.** Fase 5.1.

**Nao entregue nesta rodada:**

- **Cobertura real e de 1 municipio (Sao Paulo capital) para 2024** - a
  regra de supressao anual (`bool_or(suprimido)` sobre todas as celulas do
  ano) e rigorosa o bastante para que quase todo municipio fora da capital
  tenha pelo menos 1 celula suprimida em algum dos 4 meses REAL - achado
  estrutural do dado REAL (esparso), nao um bug (ver
  `docs/fase-5.2-relatorio.md` #5.1 e `docs/known-limitations.md`);
- Censo 2022 (tabela SIDRA 9514, quebra por idade/sexo) identificado, nao
  ingerido - so teria valor pratico quando alguma competencia SIH REAL de
  2022 existir no catalogo pysus, o que nao foi verificado;
- Pressao Hospitalar Estimada REAL continua indisponivel (sem mudanca -
  SIH e CNES REAL nao compartilham competencia).

**Criterio de conclusao.** Ao menos um indicador REAL, alem da geografia e
capacidade de leitos, calculado e visivel no dashboard, com proveniencia
REAL correta. Atingido - `TAXA_INTERNACAO_10K_HAB` REAL existe, e verificada
em `/municipios/578` (Sao Paulo), mesmo com cobertura de 1 municipio.

---

## Fase 5.3 - CNES historico + primeiro Radar REAL `CONCLUIDA (parcial - ver limitacoes)`

**Objetivo.** Resolver a limitacao estrutural que impedia Pressao
Hospitalar Estimada REAL (SIH e CNES nunca compartilhavam competencia -
docs/sih-methodology.md #9/#11.2) e, com isso, produzir o primeiro
RiskScore/RiskComponenteValor REAL desde que o produto existe.

**Entregas.**

- `etl/ingest_cnes_historico.py` (container Linux dedicado,
  `etl/docker/Dockerfile.cnes_historico`, mesma solucao do SIH): CNES
  historico REAL, grupo LT (leitos por competencia, via pySUS), para as
  mesmas 4 competencias ja cobertas por SIH REAL (2024-02/06/08/12) -
  3.917 linhas de `FatoCapacidadeLeitos` REAL, idempotente;
- `calculate-risk-real.ts`: primeiro calculo do Radar (RiskComponenteValor +
  RiskScore) sobre municipios/competencias REAL, reaproveitando as mesmas
  funcoes de `packages/risk` ja usadas pelo DEMO. RiskConfig REAL nova
  (pesos iguais, nao oficial, mesma logica das configs DEMO da Fase 2). 19
  RiskScore REAL materializados (4-6 municipios por competencia) - o Radar
  deixou de ser exclusivamente DEMO;
- nenhuma mudanca de API, contrato ou frontend foi necessaria - verificado
  ao vivo em `/municipios/78` (Barretos): indice 1.00, Critico, componente
  Pressao Hospitalar com valor REAL, demais componentes corretamente
  indisponiveis;
- 15 testes de integracao novos (`packages/db/src/__tests__/fase5.3.test.ts`)
  + correcao de 3 testes pre-existentes (Fase 2/5) que assumiam a
  limitacao agora resolvida.

Detalhes completos: [`docs/fase-5.3-relatorio.md`](fase-5.3-relatorio.md) e
[`docs/sih-methodology.md`](sih-methodology.md) #12.

**Dependencias.** Fase 5.2.

**Nao entregue nesta rodada:**

- Cobertura ainda modesta (4-6 de ~350-600 municipios por competencia) -
  mesma supressao n<5, agora por mes em vez de por ano inteiro;
- UTI nunca gravado a partir desta fonte (decisao conservadora, CODLEITO
  sem tabela estavel confirmada);
- VULNERABILIDADE REAL segue sem fonte configurada (proximo item natural,
  ver Fase 6/pendencias);
- TENDENCIA/SEVERIDADE REAL sem mudanca (lacuna metodologica).

**Criterio de conclusao.** Pelo menos uma competencia com RiskScore REAL
calculado e visivel no dashboard. Atingido - 4 competencias, 19 RiskScore
REAL, verificado no navegador.

---

## Fase 5.4 - Vulnerabilidade social (IPVS) + Radar REAL ampliado `CONCLUIDA (parcial - ver limitacoes)`

**Objetivo.** Ativar VULNERABILIDADE - sem fonte definida desde a Fase 0 -
usando o Indice Paulista de Vulnerabilidade Social (IPVS, Fundacao SEADE).

**Entregas.**

- Decisao de metodologia aprovada explicitamente pelo usuario: a unica
  fonte IPVS maquina-legivel e por setor censitario (nao municipio) e sem
  licenca declarada na pagina do recurso - `etl/ingest_vulnerabilidade.py`
  agrega por municipio via media ponderada por populacao (natureza
  `ESTIMATIVA`, licenca registrada como nao declarada, nunca inventada);
- `HEALTHMAP_BRONZE_DIR` finalmente em uso (reservada desde a Fase 0) -
  arquivos grandes (IPVS + populacao por setor, ~100MB) baixados sob
  demanda, nunca versionados;
- `IndicadorMunicipal` REAL (`IPVS_MEDIA_PONDERADA_SETOR`) para os 645
  municipios, 82,9% de cobertura de setores no calculo;
- Nova `RiskConfig` REAL (`fase5.4-real`) com VULNERABILIDADE apontando
  para o indicador - `calcularVulnerabilidade` (`packages/risk`) nao
  precisou de nenhuma mudanca (ja aceitava valor externo desde a Fase 2);
- **Radar REAL saltou de 19 para 2.580 RiskScore** (645 municipios x 4
  competencias) - com VULNERABILIDADE cobrindo 100% dos municipios, o
  Radar deixa de depender so da disponibilidade de SIH+CNES;
- corrigida flakiness de infraestrutura de teste (`packages/db/vitest.config.ts`,
  `fileParallelism: false`) - achado ao crescer a suite, nao um bug de
  produto;
- 19 testes novos (8 Python + 11 TypeScript).

Detalhes completos: [`docs/fase-5.4-relatorio.md`](fase-5.4-relatorio.md).

**Dependencias.** Fase 5.3.

**Nao entregue nesta rodada:**

- Aproximacao, nao produto oficial da SEADE (media ponderada e calculo
  deste projeto, nao publicado pronto pela fonte);
- Licenca da fonte primaria nao confirmada;
- TENDENCIA/SEVERIDADE REAL sem mudanca (lacuna metodologica).

**Criterio de conclusao.** Componente VULNERABILIDADE do Radar produzindo
valor REAL. Atingido - 645 municipios, verificado no navegador.

---

## Fase 5.5 - Radar Regional `CONCLUIDA (parcial - ver limitacoes)`

**Objetivo.** Aggregar o Radar de Risco por Regiao de Saude (DRS), com
supressao n<5 decidida de forma INDEPENDENTE no grao regional (nao derivada
dos fatos municipais ja suprimidos, o que nao reduziria supressao nenhuma -
ver decisao registrada abaixo).

**Entregas.**

- 5 tabelas `gold` novas (migration `fase5_5_regional`):
  `FatoInternacaoResidenciaRegional`, `FatoInternacaoLocalRegional`,
  `FatoCapacidadeLeitosRegional`, `RiskComponenteValorRegional`,
  `RiskScoreRegional` - paralelas as tabelas municipais, nunca uma soma
  delas;
- `etl/ingest_sih.py` e `etl/ingest_cnes_historico.py` estendidos para
  agregar tambem por regiao, a partir do MESMO dataframe bruto usado para o
  grao municipal - supressao regional e decidida de novo, independente;
- `calculate-risk-regional.ts`: reaproveita as mesmas funcoes de
  `packages/risk`, mesma RiskConfig REAL do grao municipal (RiskConfig nao
  e "por grao") - **68 RiskScoreRegional REAL, 17 regioes x 4 competencias,
  100% de cobertura** (bem acima dos 4-6 municipios/competencia do grao
  municipal, exatamente porque a supressao e decidida sobre volume regional,
  nao municipal);
- `GET /api/risk/regioes` (+`:regiaoSaudeId`+`/components`) - mesmo padrao
  arquitetural do endpoint municipal;
- 15 testes de integracao (`fase5.5.test.ts`).

Detalhes completos: [`docs/fase-5.5-relatorio.md`](fase-5.5-relatorio.md)
(a ser escrito - ver known-limitations.md).

**Dependencias.** Fase 5.4.

**Nao entregue nesta rodada:**

- Sem frontend dedicado ao Radar Regional nesta rodada;
- `IndicadorRegional` (agregado de IPVS por regiao) usa media ponderada dos
  valores municipais ja calculados, nao uma nova ingestao regional.

**Criterio de conclusao.** Radar regional calculado e consultavel via API.
Atingido - 68 RiskScoreRegional, verificado via chamada real a API.

---

## Fase 5.6 - Mortalidade oncologica (SIM) `CONCLUIDA (parcial - ver limitacoes)`

**Objetivo.** Adicionar o primeiro indicador REAL de mortalidade
(`TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB`, fonte SIM/DATASUS), deliberadamente
fora do RiskScore - decisao metodologica explicita, nao uma omissao.

**Entregas.**

- Tres rodadas de investigacao antes de qualquer codigo de producao (spike
  de fontes DATASUS/TABNET, validacao inicial do SIM, validacao final do
  recorte C00-C97) - achados usados diretamente na implementacao: encoding
  de SEXO/IDADE do SIM confirmadamente diferente do SIH, chave de
  deduplicacao, regra generica de municipio invalido;
- `gold.FatoObitoResidencia` (migration `fase5_6_obito_grao_anual`,
  substituindo a versao inicial de grao fino) - grao **municipio x ano x
  grupoCid**, sem eixo internacao (obito nao tem "local de atendimento"
  equivalente); pivo de grao decidido apos a carga real mostrar 0% de
  cobertura no grao fino (`bool_or` sobre ~216 celulas por municipio/ano
  suprimia o total quase sempre) - ver `docs/fase-5.6-relatorio.md` #5.1;
- `etl/ingest_sim.py`: 2023 e 2024, SP, C00-C97 - 60.827 obitos antes da
  dedup em 2023 (60.826 depois, 1 duplicata real removida) e 62.542 em 2024
  (62.537 depois, 5 duplicatas), municipio invalido (350000) rejeitado
  genericamente (nao um `if` hardcoded), 1.287 celulas municipio x ano
  gravadas (644 em 2023, 643 em 2024), idempotente (segunda execucao
  produz os mesmos numeros e nao duplica linhas);
- `calculate-indicadores-mortalidade-real.ts`: reaproveita `calcularTaxaPor10k`
  ja existente (`packages/risk`) - nenhuma funcao nova de calculo;
- **RiskScore/RiskScoreRegional NAO foram alterados** - nenhum arquivo de
  `packages/risk` tocado, nenhuma RiskConfig aponta para este indicador,
  confirmado por teste automatizado;
- nenhuma tela nova no frontend - o card de indicador ja generico (Fase
  5.2) passou a exibir o indicador automaticamente; unico ajuste foi expor
  o campo `denominador`, ja existente na API e nunca renderizado;
- achado de infraestrutura corrigido: `pysus` com faixa de versao aberta
  quebrou ao reconstruir a imagem do zero (API interna mudou entre
  versoes) - fixado em `==2.8.0` para este container; o mesmo risco
  permanece nos containers SIH/CNES-historico, registrado como pendencia;
- 28 testes Python (funcoes puras) + testes de integracao TypeScript
  (`fase5.6.test.ts`);
- **incidente e recuperacao**: durante a migracao de grao, um comando
  `prisma migrate diff --shadow-database-url` apontou por engano para o
  banco real e apagou todos os dados (schema preservado). Comunicado de
  forma transparente, recuperado com aprovacao explicita do usuario -
  seed DEMO + toda ingestao REAL reexecutada do zero, numeros finais
  identicos aos anteriores ao incidente. Ver `docs/fase-5.6-relatorio.md` #9.

Detalhes completos: [`docs/fase-5.6-relatorio.md`](fase-5.6-relatorio.md).

**Dependencias.** Fase 5.5.

**Nao entregue nesta rodada:**

- Cobertura de 87,6% (2023) e 89,8% (2024) dos municipios (mesma ordem de
  grandeza do spike) - o resto fica suprimido (n<5), honestamente, nunca
  com valor 0;
- Indicador so materializa para 2024 - 2023 tem fato REAL valido, mas sem
  populacao IBGE 2023 (lacuna ja conhecida desde a Fase 5.2) o denominador
  nao existe;
- `requirements-sih.txt`/`requirements-cnes-historico.txt` continuam com a
  mesma fragilidade de versao de `pysus` (faixa aberta) corrigida so para SIM.

**Criterio de conclusao.** Indicador REAL observado, visivel no produto, sem
alterar o RiskScore. Atingido - numeros da carga real bateram exatamente com
os da validacao previa, RiskScore comprovadamente inalterado por teste.

---

## Fase 5.7 - Radar Municipal (mapa interativo) `CONCLUIDA (parcial - ver limitacoes)`

**Objetivo.** Primeira visualizacao territorial interativa: mapa dos 645
municipios REAL de SP, coloridos por um indicador a escolha (internacoes,
taxa de internacao, obitos oncologicos, mortalidade oncologica, RiskScore,
vulnerabilidade), com tooltip, ranking ordenavel e painel de detalhamento
ao clicar. Nenhum indicador novo, nenhuma fonte nova, nenhum recalculo -
so uma nova forma de ler dado ja materializado pelas Fases 5.2-5.6.

**Entregas.**

- `GET /api/indicadores/municipios` (route -> controller -> service ->
  packages/db, nenhum SQL em apps/api) - devolve os 645 municipios REAL de
  uma vez para o indicador+ano selecionados, nunca 1 requisicao por
  municipio; `anosDisponiveis` sempre calculado a partir do banco, nunca
  inventado;
- `GET /api/municipios/:id` estendido (contrato aditivo) com
  `internacoesAnuais`/`obitosOncologicosAnuais` - os 2 totais brutos que
  faltavam para o painel de detalhamento;
- `packages/db/src/repositories/radarQuery.ts` (novo) - so orquestra
  agregados ja existentes (`getAgregadoInternacaoResidenciaAnual`,
  `getAgregadoObitoResidenciaAnual`, `getIndicadorMunicipalPorDefinicao`,
  `listRiskScores`), nenhuma segunda implementacao de agregacao/supressao;
- `apps/web/components/charts/map.tsx` (`MapaSP`) generalizado com props
  opcionais de cor/tooltip/clique - default identico ao anterior, zero
  regressao em `/` e `/radar`;
- `apps/web/app/radar-municipal/page.tsx` (rota nova, adicionada a
  navegacao) - mapa + ranking ordenavel (maior<->menor) + painel de
  detalhamento com os 6 indicadores, "Nao disponivel" nunca 0;
- 9 testes de integracao (`apps/api/src/__tests__/indicadores-municipios.test.ts`):
  cobertura IBGE, supressao nunca vira 0, filtro de ano rejeita ano
  inexistente (404), RiskScore comprovadamente nao recalculado (contagem
  de RiskConfig/RiskComponenteValor identica antes/depois);
- decisao registrada: RiskScore nao tem grao anual nativo (e por
  competencia/mes) - `getCompetenciaMaisRecenteComRiskScorePorAno` resolve
  a competencia mais recente DENTRO do ano selecionado com RiskScore, sem
  inventar um "RiskScore anual" novo (mesma filosofia de resolucao de
  default ja usada desde a Fase 3).

Detalhes completos: [`docs/fase-5.7-relatorio.md`](fase-5.7-relatorio.md).

**Dependencias.** Fase 5.6.

**Nao entregue nesta rodada:**

- `INTERNACOES`/`TAXA_INTERNACAO_10K_HAB` herdam a limitacao de supressao
  de grao fino ja documentada (cobertura de 1 municipio/ano) - nao
  corrigida aqui, fora de escopo (exigiria o mesmo pivo de grao anual da
  Fase 5.6, decisao metodologica separada);
- Sem persistencia de filtro na URL (diferente de `/radar`/`/`);
- Sem testes automatizados de frontend (mesma decisao ja registrada desde
  a Fase 4 - `apps/web` nao tem framework de teste, nao criado agora sem
  necessidade).

**Criterio de conclusao.** Mapa territorial interativo funcionando com os 6
indicadores, RiskScore comprovadamente inalterado, testes/typecheck/lint/
build passando. Atingido - validado manualmente no navegador (6/6
indicadores, tooltip, clique, ranking, painel de detalhamento) e por teste
automatizado.

---

## Fase 6 - Seguranca + Governanca

**Objetivo.** Tornar o MVP operavel com controle de acesso e rastreabilidade.

**Entregas.** Autenticacao; RBAC efetivo com escopo territorial (substituindo a
politica permissiva); trilha de auditoria de consulta e exportacao; hardening da
API; politica de retencao e descarte; Dockerfiles dos demais servicos; deploy.

**Dependencias.** Fase 5. Definicoes pendentes: regra de disparo dos alertas de
capacidade; ambiente de hospedagem.

**Criterio de conclusao.** Nenhum acesso anonimo a dados; toda consulta e
exportacao registradas.

---

## Fase 7 - Analitica avancada + OCI

**Objetivo.** Preparar a solucao para piloto real.

**Entregas.** Projecao por metodo estatistico simples e auditavel, rotulada como
PROJECAO com intervalo de incerteza; calibracao dos pesos e eventual promocao de
`RiskConfig` a oficial; metricas de vies por subgrupo; observabilidade;
agregacao por Regiao de Saude; plano de migracao para OCI; avaliacao do
Select AI.

**Dependencias.** Fase 6. Definicao pendente: metodo de projecao.

**Criterio de conclusao.** Projecoes auditaveis e documentadas; nenhum modelo
complexo de machine learning introduzido sem validacao previa.
