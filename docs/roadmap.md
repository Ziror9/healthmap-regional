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
