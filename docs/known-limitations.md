# Limitacoes conhecidas

> Documento vivo. Toda limitacao que afeta a leitura dos numeros deve estar
> registrada aqui e refletida na interface do produto.

## 1. Estagio do projeto

- **O projeto nao esta pronto para uso operacional.** Nao deve embasar decisao
  de saude publica no estado atual.
- Fases 0-5 concluidas (Fase 2, 3, 4 e 5 parciais - ver secoes 5, 8, 9 e 10):
  existe fundacao tecnica, schema de dominio, migrations, base DEMO
  deterministica, motor de risco funcional sobre essa base, uma API REST
  somente-leitura expondo esses dados, um dashboard navegavel consumindo
  essa API (agora com mapa geografico real de SP), e uma primeira ingestao
  REAL (geografia IBGE completa + capacidade de leitos CNES) convivendo com
  a base DEMO sem mistura.
- **A API (Fase 3) e o frontend (Fase 4) sao publicos, sem autenticacao nem
  RBAC efetivo** - ver secao 7. Nao devem ser expostos fora de ambiente de
  desenvolvimento.
- **O Radar de Risco continua parcial e continua calculado so sobre a base
  DEMO.** A ingestao REAL da Fase 5 trouxe geografia, capacidade de leitos
  e (numa segunda rodada) internacoes oncologicas do SIH/SUS para uma
  competencia de prova de conceito (2024-02) - mas Pressao Hospitalar
  Estimada REAL continua indisponivel porque as duas fontes REAL que ela
  precisa (SIH e CNES) nao tem nenhuma competencia em comum ainda (motivo
  completo: secao 10, `docs/sih-methodology.md` #9). Ver secoes 5 e 10.

## 2. Dados

- **Dados DEMO nao sao dados oficiais.** A base DEMO (Fase 1) e sintetica,
  gerada por um script deterministico (`packages/db/src/scripts/seed-demo.ts`)
  para desenvolvimento e validacao do schema. Nenhum valor DEMO pode ser lido
  como informacao sobre a situacao real de qualquer municipio.
- **A geografia agora e oficial (resolvido na Fase 5).** `etl/ingest_geografia.py`
  carrega os 645 municipios oficiais de SP direto da API do IBGE (codigos
  IBGE7/IBGE6 reais) e os 17 Departamentos Regionais de Saude oficiais
  (fonte: SES-SP, referencia local versionada em
  `etl/reference-data/drs_sp_ibge.csv`, procedencia documentada em
  `etl/reference-data/README.md`). Convive com os 15 municipios DEMO
  ilustrativos (prefixo sintetico `36xxxxx`, escolhido para nao colidir com
  nenhum codigo IBGE real de nenhum estado) sem mistura - ver
  `docs/data-model.md` #3 e `docs/fase-5-relatorio.md`.
  `latitude`/`longitude` dos municipios REAIS sao um centroide aproximado
  (media dos vertices do poligono do IBGE, nao o centroide de area exato) -
  suficiente para o mapa da Visao Geral, documentado como aproximacao.
- **Taxonomias provisorias, nao validadas contra a fonte real (continuam
  pendentes - a cobertura SIH ingerida ate agora e so um POC de 1
  competencia, insuficiente para validar isso em definitivo):**
  - `FaixaEtaria` usa corte decenal (`FX_00_09` ... `FX_80_MAIS`). O SIH-RD
    real usa `COD_IDADE` (dias/meses/anos) + `IDADE`, mapeado para o corte
    decenal em `healthmap_etl/sih_transform.py` - ver `docs/sih-methodology.md`
    §4. O corte decenal em si nunca foi confirmado como o padrao oficial do
    produto, so passou a ser alimentavel por dado real.
  - `TipoLeito` usa uma taxonomia simplificada (`CLINICO`, `CIRURGICO`, `UTI`,
    `OUTRO`), nao validada contra o dicionario de dados do CNES. A ingestao
    REAL de leitos (Fase 5) so grava `UTI` e `OUTRO` - a fonte usada
    (`/assistencia-a-saude/hospitais-e-leitos`) nao distingue
    `CLINICO`/`CIRURGICO` dentro do total nao-UTI, e ratear essa diferenca
    exigiria uma premissa nao documentada (ver `etl/ingest_cnes.py`).
    Tambem em aberto se o recorte certo para a formula de Pressao
    Hospitalar Estimada e "tipo de leito" ou "habilitacao oncologica do
    estabelecimento" - ver `docs/risk-methodology.md`.
- **Integracao com o SIH/SUS implementada para um POC controlado (segunda
  rodada da Fase 5)** - `FatoInternacaoResidencia`/`FatoInternacaoLocal`
  REAL existem para 1 competencia (2024-02, SP). Ver secao 10 e
  `docs/sih-methodology.md` para cobertura exata, decisoes e limitacoes.
- **Integracao com o CNES implementada parcialmente (Fase 5).** Ver secao 10.
- **Integracao com o IBGE implementada (Fase 5)** para municipios e malha
  territorial (GeoJSON). **Populacao (Censo 2022, tabela 9514 do SIDRA) foi
  investigada mas nao implementada nesta fase** - fonte identificada e
  publica, mas a ingestao ficou fora do tempo disponivel da Fase 5; a base
  DEMO de `Populacao` continua sendo o unico dado de populacao no sistema.
  Sem populacao REAL, a taxa de internacao por 10k habitantes (TENDENCIA)
  tambem nao pode ser REAL, mesmo com `FatoInternacaoResidencia` REAL
  agora existindo.

## 3. Limitacoes estruturais das fontes (valerao mesmo com dados reais)

- **Defasagem de publicacao.** Os dados do SIH/SUS chegam com atraso relevante.
  O produto nunca sera "tempo real" e nao deve usar essa linguagem. A competencia
  mais recente e a defasagem em dias devem ser exibidas.
- **Revisao retroativa.** O DATASUS revisa dados ja publicados; competencias
  antigas mudam. Por isso o reprocessamento periodico e o versionamento das
  pontuacoes sao obrigatorios.
- **Subnotificacao e inconsistencia** nos registros de origem.
- **Cobertura apenas SUS.** Nao inclui saude suplementar. Municipios com alta
  cobertura de planos privados aparecerao subestimados. Isso e uma limitacao
  estrutural, nao um erro do sistema.
- **Leitos autodeclarados.** A capacidade vem do CNES por autodeclaracao dos
  estabelecimentos e pode estar desatualizada.

## 4. Indicadores

- **Todos os indicadores precisam de validacao** antes de qualquer uso real.
- **Dados de pressao hospitalar sao estimativas**, derivadas de pacientes-dia e
  capacidade de leitos. Nao sao ocupacao observada. Ver
  [`risk-methodology.md`](./risk-methodology.md).
- Indicadores agregados por municipio nao representam nenhum estabelecimento
  especifico.
- Letalidade mais alta em municipios-polo pode refletir a complexidade dos casos
  recebidos, e nao desempenho assistencial.

## 5. Radar de Risco

- **Calculado desde a Fase 2, mas parcial: so 1 dos 4 componentes produz
  valor.** `PRESSAO_HOSPITALAR_ESTIMADA` esta implementada exatamente
  conforme a formula documentada. `TENDENCIA` e `SEVERIDADE` ficam
  estruturalmente prontas mas **sempre indisponiveis** - a metodologia
  nunca definiu a janela movel/sazonalidade de TENDENCIA nem os
  pesos/formula de composicao dos 3 sub-indicadores de SEVERIDADE, e
  inventar esses valores foi explicitamente proibido. `VULNERABILIDADE`
  permanece indisponivel como sempre foi previsto (fonte nao definida).
  Detalhes: `docs/fase-2-relatorio.md`.
- **Os pesos usados na Fase 2 sao iguais (0.25 por componente) e
  explicitamente DEMO/nao-oficiais.** Nao ha valor demonstrativo
  documentado no repositorio para reutilizar; peso igual foi escolhido por
  ser a unica distribuicao que nao expressa julgamento de importancia
  relativa entre componentes. `oficial = false` em toda `RiskConfig`
  existente. O banco garante estruturalmente no maximo uma `RiskConfig`
  oficial por vez (indice unico parcial).
- **A classificacao em faixas (CRITICO..MUITO_BAIXO) usa quintis relativos
  da coorte como metodo PROVISORIO, nao confirmado.**
  `docs/risk-methodology.md` sempre deixou em aberto a escolha entre quintis
  e cortes absolutos fixos ("decisao necessaria antes da Fase 2") - a
  decisao nunca foi tomada por quem define a metodologia. Quintis foi
  implementado por ser a opcao que nao exige inventar numeros de corte, mas
  precisa de confirmacao formal antes de qualquer uso alem de
  desenvolvimento/demonstracao.
- **Confiabilidade so distingue ALTA/BAIXA, nunca MEDIA.** A metodologia
  define apenas o corte de BAIXA (abaixo de `limiarVolumeMinimo`); nao ha
  segundo limiar documentado para separar ALTA de MEDIA.
- O indice e analitico e experimental. Nao e diagnostico clinico.

## 5.1 Supressao de celulas pequenas

- Limiar adotado: `n < 5`. Aplicado no seed DEMO (e sera aplicado no ETL real
  na Fase 5) na granularidade minima do fato (`suprimido = true`, medidas
  numericas = `NULL`), reforcado por CHECK constraint no banco.
- **A API da Fase 3 nao agrega fato bruto em nenhum endpoint** - so serve
  `RiskScore`/`RiskComponenteValor`/`IndicadorMunicipal` ja materializados
  pela Fase 2, onde a regra `NULL != 0` ja foi aplicada na agregacao
  (`bool_or` no SQL, ver `packages/db/src/repositories/risk.ts`). A API so
  repassa os campos nulos como estao - nunca os transforma em `0`
  (verificado por teste automatizado em `apps/api/src/__tests__/risk.test.ts`).
  A preocupacao original desta secao (soma ingenua via `SUM()` subestimando
  um total incompleto) continua valendo para qualquer endpoint FUTURO que
  venha a agregar fato bruto diretamente (ex.: um KPI de cabecalho na
  Fase 4) - precisa ser resolvida antes desse endpoint existir.
- O valor `5` nao esta embutido em codigo sem documentacao, mas tambem nao
  esta versionado em banco junto da metodologia do Radar (decisao explicita
  desta fase, para nao acoplar supressao de fatos brutos ao ciclo de vida do
  `RiskConfig`, que so nasce - mesmo estruturalmente - na Fase 1/2). E um
  parametro sujeito a revisao metodologica e juridica futura.

## 6. Escopo

- MVP restrito ao estado de Sao Paulo.
- Recorte oncologico restrito a neoplasias malignas (CID-10 C00-C97).
- Ate 5 anos de historico, **se** os dados estiverem disponiveis e consistentes.
  Caso a disponibilidade real seja menor, sera usado o maior periodo confiavel e
  a limitacao sera registrada aqui.
- **Agregacao analitica por Regiao de Saude ainda nao implementada na API.**
  A Visao Geral (Fase 4) agrupa municipios por Regiao de Saude apenas para
  exibicao (join client-side entre `/api/municipios` e `/api/risk`) - nao
  existe um endpoint que calcule indicador ou indice agregado por regiao.

## 7. Plataforma

- Nao ha autenticacao. A camada de autorizacao existe preparada, porem inerte,
  ate a Fase 6.
- Nao ha trilha de auditoria de consultas ainda.
- O enquadramento juridico do tratamento de dados (LGPD, designacao de
  responsavel, eventual dispensa de CEP) **nao foi validado juridicamente**. O
  projeto adota postura conservadora - dados publicos, agregados, sem base
  identificavel - mas nao declara conformidade.

## 8. API (Fase 3)

- **API publica, sem autenticacao.** Qualquer cliente que alcance a porta da
  API le qualquer dado exposto pelos endpoints - nao ha RBAC efetivo (Fase 6)
  nem camada `policies`. So deve rodar em ambiente de desenvolvimento.
- **Escopo de endpoints reduzido ao explicitamente pedido**: catalogo
  (municipios/regioes/competencias/indicadores) e Radar
  (ranking/detalhe/componentes). Nao existem ainda endpoints de KPI de
  cabecalho, mapa, serie temporal ou pagina de metodologia - a semantica
  operacional dos KPIs nunca foi definida (pendencia herdada do roadmap
  original da Fase 3).
- **Resolucao de filtros quando omitidos** (documentada em
  `docs/fase-3-relatorio.md` e no codigo de
  `apps/api/src/services/risk.service.ts`): competencia mais recente por
  `dataRef`; `RiskConfig` oficial se existir, senao a mais recente com
  componentes ativos (nenhuma `RiskConfig` e oficial em nenhum ambiente
  conhecido nesta fase); origem nao filtrada por padrao, mas a API responde
  `409 ORIGEM_AMBIGUA` se mais de uma origem estiver presente no resultado -
  nunca mistura REAL e DEMO silenciosamente numa mesma lista.
- **Nenhum endpoint de escrita/administracao de `RiskConfig`** foi criado -
  toda `RiskConfig` usada pela API vem do que ja foi semeado/calculado pelas
  Fases 1/2.
- Paginacao com teto de 200 itens por pagina - nao testada contra volume
  real (a base DEMO atual tem poucas dezenas de linhas por tabela).

## 9. Frontend / Dashboard (Fase 4, mapa atualizado na Fase 5)

- **Mapa geografico implementado na Fase 5** (`apps/web/components/charts/map.tsx`),
  usando o GeoJSON real de SP (`apps/web/public/geo/sp-municipios.geojson`,
  fonte IBGE, ver `apps/web/public/geo/README.md`) renderizado em SVG puro
  (sem Leaflet). **O mapa mostra os 645 municipios REAIS com sua geometria
  oficial, mas o Radar de Risco continua calculado so sobre a base DEMO** -
  a maior parte dos municipios do mapa aparece sem classificacao de risco
  (cor neutra, tooltip "sem indice REAL calculado") - mesmo com SIH REAL
  agora ingerido para um municipio-competencia poder ter internacoes REAL,
  Pressao Hospitalar Estimada REAL continua indisponivel (secao 10), entao
  nenhum municipio REAL tem classificacao ainda. Estado honesto, nao um
  bug. Clique navega para o detalhe do municipio.
- **Filtros da UI limitados aos que a API suporta.** `/api/risk` (Fase 3) so
  aceita `competenciaId`/`riskConfigId`/`origem` - por isso a UI so oferece
  filtro global de competencia e origem (sincronizados com a URL). Filtro de
  classificacao (Radar) e de regiao/busca (Municipios) sao filtros
  client-side sobre a lista ja carregada da API, nao nova consulta ao
  servidor. Nao ha filtro de sexo, faixa etaria ou municipio no Radar porque
  a API nao os expoe - criar um filtro decorativo que nao muda o dado
  buscado foi evitado deliberadamente.
- **Sem seletor de RiskConfig na UI.** A Fase 3 nao expoe um catalogo de
  configuracoes do Radar disponiveis (`/api/risk-configs` nao existe);
  construir um seletor exigiria hardcodar IDs de configuracao no frontend,
  o que este projeto proibe. A API resolve um default documentado
  (`docs/fase-3-relatorio.md` #7) quando `riskConfigId` nao e informado.
- **KPIs da Visao Geral sao agregacao de apresentacao, nao um endpoint
  dedicado.** Contagem, indice medio e distribuicao por classificacao sao
  calculados no navegador, em cima da lista de `RiskScore` ja retornada por
  `/api/risk` - nenhum indice, peso ou classificacao e recalculado no
  frontend. KPIs de volume absoluto (internacoes, obitos) nao aparecem: exigiriam
  um endpoint agregando fato bruto, que a Fase 3 deliberadamente nao criou.
- **Sem componente de projecao.** Natureza `PROJECAO` tem tratamento visual
  definido (`components/domain/*-badge.tsx`, `lib/risk-display.ts`), mas
  nenhum dado com essa natureza existe ainda (Fase 7 e quem introduz
  projecao estatistica).
- Testes automatizados de `apps/web` nao foram criados nesta fase (o
  projeto nao tinha tooling de teste de frontend antes da Fase 4); a
  validacao foi feita via `typecheck`, `lint`, `build` de producao e
  verificacao manual das paginas no navegador - ver `docs/fase-4-relatorio.md`.

## 10. Ingestao REAL (Fase 5)

- **SIH/SUS: bloqueio de ambiente contornado com Docker, dado REAL ingerido
  para um POC controlado (segunda rodada da Fase 5).** `pysus` continua
  impossivel de instalar no Python principal do host (Windows) - `pyreaddbc`
  so publica wheel pre-compilado para Linux, nao para Windows, e compilar
  do zero exigiria Microsoft Visual C++ Build Tools. Contornado com um
  container Linux dedicado (`etl/docker/Dockerfile.sih`, `pyreaddbc` tem
  wheel Linux pronto, confirmado nesta sessao) que roda so a ingestao SIH,
  isolado do ambiente principal e do `docker-compose.yml` do projeto (que
  continua exclusivo de PostgreSQL+Adminer). Resultado real: 221.117
  registros brutos de AIH lidos (SP, competencia 2024-02), 16.020
  oncologicos (C00-C97), 16.016 validos apos exclusoes honestas (nunca
  adivinhadas) de faixa etaria indeterminada - agregados em 3.467 celulas
  de `FatoInternacaoResidencia` e 1.177 de `FatoInternacaoLocal`, com
  supressao n<5 aplicada (2.829 e 710 celulas suprimidas respectivamente).
  Detalhes completos, decisoes metodologicas e o que NAO foi resolvido:
  `docs/sih-methodology.md`.
- **Catalogo do pySUS para SIH/SP nao e continuo.** No momento da ingestao,
  152 arquivos RD/SP existiam entre 1992-01 e 2026-02 (de ate ~408 meses
  possiveis) - o POC solicitou 2024-01/02/03 e so 2024-02 estava
  disponivel; 2024-01 e 2024-03 foram reportados como ausentes, nunca
  preenchidos com dado inventado. A causa da lacuna (DATASUS vs. espelho do
  pySUS) nao foi determinada - ver `docs/sih-methodology.md` §8.
- **Pressao Hospitalar Estimada REAL continua indisponivel mesmo com SIH
  ingerido** - nao por limitacao de codigo, e porque as duas fontes REAL
  que o componente precisa (`pacientesDia` do SIH, `leitosSus` do CNES)
  nao compartilham nenhuma competencia: o SIH foi ingerido para 2024-02, o
  CNES e um snapshot unico preso a competencia da propria ingestao (ver
  abaixo). Confirmado em teste automatizado
  (`packages/db/src/__tests__/fase5.test.ts`) e documentado em
  `docs/sih-methodology.md` §9.
- **CNES: cobertura parcial, nao o catalogo completo.**
  `/assistencia-a-saude/hospitais-e-leitos` (capacidade de leitos) foi
  ingerido por completo para SP (377 municipios com leito, so `UTI`/`OUTRO`
  - ver acima). Ja `/cnes/estabelecimentos` foi ingerido como **amostra
  limitada** (ate 500 estabelecimentos, ver `ESTABELECIMENTOS_MAX_PAGINAS`
  em `etl/ingest_cnes.py`) - cobertura exaustiva de SP exigiria centenas de
  requisicoes (limite real da API: 20 registros/pagina). `Estabelecimento.
  habilitacaoOncologica` e sempre `false` para linhas REAL, com o
  significado explicito de "nao determinado por esta fonte" (nunca
  "confirmado sem habilitacao") - a fonte usada nao informa esse campo.
- **Bug real da API do CNES, contornado (nao e comportamento deste
  projeto):** a paginacao por offset de `/assistencia-a-saude/hospitais-e-
  leitos` nao e estavel - o mesmo hospital reaparece em paginas diferentes
  com dados identicos. Sem deduplicar, a capacidade de leitos ficaria
  inflada em ordens de grandeza (confirmado: ~90% dos registros de SP eram
  duplicatas na primeira ingestao). Corrigido deduplicando por nome +
  endereco + CEP (a fonte nao devolve codigo CNES neste endpoint) - ver
  `healthmap_etl.sources.cnes.deduplicar_hospitais` e
  `etl/tests/test_cnes.py`. **Os totais pos-deduplicacao nao foram
  cross-validados contra uma estatistica publicada independente** (ex.:
  total oficial de leitos SUS na capital) - tratar como plausivel, nao como
  numero auditado externamente, ate essa validacao existir.
- **Populacao (IBGE, Censo 2022) nao implementada** - ver secao 2. Mesmo com
  `FatoInternacaoResidencia` REAL agora existindo (SIH), a taxa de
  internacao por 10k habitantes continua indisponivel para REAL porque
  ainda falta o denominador (populacao REAL).
- **`FatoCapacidadeLeitos` REAL e um snapshot, nao historico por
  competencia.** A fonte CNES usada nao expoe capacidade por competencia
  passada - o snapshot foi anexado a uma `Competencia` criada para o mes da
  ingestao (`obter_ou_criar_competencia_atual` em `ingest_cnes.py`), que
  por isso pode aparecer no seletor de competencia da UI sem nenhum Radar
  calculado (comportamento esperado, ver `EmptyState` na Visao Geral).
- **Colisão de nome entre município DEMO e município REAL (encontrada e
  corrigida na auditoria final da Fase 5).** 8 dos 15 municípios
  ilustrativos do seed DEMO reusam o nome exato de um município REAL
  homônimo (Campinas, Guarulhos, Sorocaba, Franca, Barretos, Bauru,
  Presidente Prudente, Santos) - `Municipio` não tem coluna `origem` por
  design (só os fatos têm, ver `docs/data-model.md` #3), então as duas
  linhas apareciam no catálogo (`/municipios`) e no cabeçalho do detalhe
  (`/municipios/[id]`) distinguíveis apenas pelo código IBGE, sem nenhum
  rótulo textual. Corrigido adicionando `inferOrigemMunicipio()`
  (`apps/web/lib/risk-display.ts`) - deriva REAL/DEMO client-side do
  prefixo do `codigoIbge7` (mesma convenção já usada por
  `seed-demo.ts`/`ingest_geografia.py`, nenhum dado novo) - e exibindo um
  `ProvenanceBadge` em toda linha do catálogo e um texto explícito
  "Município ilustrativo (DEMO)" no cabeçalho do detalhe quando aplicável.
  O mapa (`MapaSP`) não foi afetado: só renderiza os 645 `codarea` do
  GeoJSON REAL, nunca os municípios DEMO.
- **`calculate-risk-demo.ts` precisou ser corrigido nesta fase** para
  filtrar explicitamente os municipios DEMO (`getMunicipios(prisma, {
  apenasDemo: true })`) - antes da correcao, o script processava tambem os
  645 municipios REAL (sem nenhum fato DEMO associado), o que alem de
  degradar a performance (~300s -> ~11s apos a correcao) gravava
  `RiskComponenteValor` com `origem: 'DEMO'` para municipios REAIS. Os
  dados incorretos gerados antes da correcao foram apagados do banco antes
  de fechar a Fase 5 - ver `docs/fase-5-relatorio.md`.
