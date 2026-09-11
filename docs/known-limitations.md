# Limitacoes conhecidas

> Documento vivo. Toda limitacao que afeta a leitura dos numeros deve estar
> registrada aqui e refletida na interface do produto.

## 1. Estagio do projeto

- **O projeto nao esta pronto para uso operacional.** Nao deve embasar decisao
  de saude publica no estado atual.
- Fases 0-5.2 concluidas (Fase 2, 3, 4, 5 e 5.2 parciais - ver secoes 5, 8, 9
  e 10): existe fundacao tecnica, schema de dominio, migrations, base DEMO
  deterministica, motor de risco funcional sobre essa base, uma API REST
  somente-leitura expondo esses dados, um dashboard navegavel consumindo
  essa API (agora com mapa geografico real de SP), e uma primeira ingestao
  REAL (geografia IBGE completa + capacidade de leitos CNES + populacao
  estimada IBGE) convivendo com a base DEMO sem mistura. A Fase 5.2 tambem
  materializou o primeiro `IndicadorMunicipal` REAL (`TAXA_INTERNACAO_10K_HAB`),
  mas com cobertura de apenas 1 municipio - ver secao 10.
- **A API (Fase 3) e o frontend (Fase 4) sao publicos, sem autenticacao nem
  RBAC efetivo** - ver secao 7. Nao devem ser expostos fora de ambiente de
  desenvolvimento.
- **Mortalidade oncologica REAL (Fase 5.6, SIM/DATASUS) foi adicionada como
  indicador isolado, deliberadamente fora do Radar.** `FatoObitoResidencia`
  (grao municipio x ano, supressao n<5 decidida uma unica vez sobre o total
  anual - pivo de grao explicado em `docs/fase-5.6-relatorio.md` #5.1) cobre
  87,6% dos municipios de SP em 2023 e 89,8% em 2024 (n<5 suprime o resto,
  honestamente). **O indicador `TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB` so
  materializa para 2024** - 2023 tem fato REAL valido mas o IBGE nao publica
  estimativa de populacao para esse ano (mesma lacuna da secao 2/10 para
  `TAXA_INTERNACAO_10K_HAB`), entao o denominador nao existe. Mortalidade
  populacional (obitos/populacao residente) NAO deve ser interpretada como
  letalidade hospitalar (obitos/internados) - sao conceitos epidemiologicos
  diferentes. **Taxas de municipios pequenos podem ser estatisticamente
  instaveis mesmo acima do limiar de supressao** - um municipio com n=5 ou
  6 obitos e populacao pequena produz uma taxa por 10k habitantes volatil
  (uma unica unidade a mais/menos muda o valor de forma desproporcional),
  problema distinto da supressao em si (que so esconde n<5, nao estabiliza
  o que fica acima do limiar) - nenhum tratamento estatistico adicional
  (ex.: intervalo de confianca, suavizacao) foi aplicado nesta fase. **O
  indicador e observacional e nao deve ser interpretado isoladamente como
  qualidade assistencial** - mortalidade populacional reflete uma
  combinacao de incidencia da doenca, acesso a diagnostico/tratamento e
  fatores socioeconomicos da populacao residente, nao o desempenho de
  nenhum servico de saude especifico. Ver `docs/fase-5.6-relatorio.md`.
- **Radar Municipal (Fase 5.7) - primeira visualizacao territorial
  interativa, so leitura.** Mapa dos 645 municipios REAL coloridos por 1 de
  6 indicadores (`GET /api/indicadores/municipios`). `INTERNACOES`/
  `TAXA_INTERNACAO_10K_HAB` herdam a mesma limitacao de supressao de grao
  fino ja documentada abaixo (so 1 municipio/ano nao suprimido) - o mapa
  exibe isso honestamente ("1 de 645 municipios com dado disponivel"), nao
  esconde. `VULNERABILIDADE` fica fixa em 2022 (ano do IPVS/Censo usado).
  RiskScore nao tem grao anual proprio - o filtro "Ano" resolve para a
  competencia mais recente daquele ano com RiskScore calculado, sem criar
  metodologia nova. Ver `docs/fase-5.7-relatorio.md`.
- **`TAXA_INTERNACAO_10K_HAB` passou de 1/645 para 639/645 na Fase 5.10.**
  O insumo deixou de ser a soma de celulas ja suprimidas de
  `FatoInternacaoResidencia` (onde 81,5% das celulas finas ficam NULL e o
  total anual do municipio era anulado) e passou a ser
  `gold.FatoInternacaoResidenciaAnual`, agregado do dado BRUTO pelo ETL com
  supressao n<5 decidida uma unica vez sobre o total do ano - mesma solucao
  da Fase 5.6 para o SIM. Os 6 municipios restantes seguem suprimidos
  (n<5 no ano), corretamente. `FatoInternacaoResidencia` NAO foi alterada e
  continua servindo o recorte demografico. Ver `docs/fase-5.10-relatorio.md`.
- **Isolamento REAL/DEMO das RiskConfigs corrigido (Fase 5.10).**
  `getRiskConfigsFase2` filtrava qualquer config com componentes, o que fazia
  `calculate-risk-demo.ts` gravar linhas DEMO dentro da config REAL. Passou a
  recortar pelas configs do seed (`autor startsWith 'seed-fase2'`), e as 372
  linhas DEMO indevidas (12 RiskScore + 360 RiskComponenteValor) foram
  removidas de forma direcionada, apos provar que os conjuntos eram disjuntos
  em origem, municipio e competencia. O checksum do RiskScore REAL
  (`4273e1fc...`, 7.740 linhas) permaneceu identico antes e depois.
- **As analises do produto usam REAL; DEMO ficou restrito a
  desenvolvimento/testes (Fase 5.9).** `/`, `/radar`, `/radar-municipal` e o
  catalogo `/municipios` passaram a usar REAL por padrao. A base DEMO (15
  municipios, 5 regioes "ilustrativa", seed e fixtures) continua integra no
  banco e nos testes - so nao alimenta mais as analises. O filtro de origem
  permite inspecionar DEMO deliberadamente, sempre rotulado. Antes disso,
  `/radar` abria mostrando 3 municipios sinteticos como "ranking do estado",
  e `/metodologia` afirmava que "toda a base e DEMO" (falso desde a Fase
  5.3). Ver `docs/fase-5.9-relatorio.md`.
- **Fluxo assistencial (Fase 5.8) cobre 51,7% dos pares, mas ~94% do
  volume.** `gold.FatoFluxoInternacao` (SIH/SUS 2024) tem 3.555 pares
  origem->destino, dos quais 1.717 suprimidos (n<5) - a supressao atinge
  muitos pares pequenos, mas pouco volume (183.193 das ~195 mil internacoes
  ficam visiveis). Pares com origem OU destino fora dos 645 municipios de SP
  (8.614 registros: paciente de outra UF, ou internado fora do estado) sao
  excluidos, nunca imputados. Cobre so internacao oncologica pelo SUS - nao
  inclui saude suplementar nem tratamento ambulatorial (SIA nao ingerido). A
  "taxa de atendimento fora do municipio" e um indicador DERIVADO calculado
  so sobre o volume visivel, nunca apresentado como dado observado.
- **A RiskConfig REAL (`fase5.4-real`, id 4) teve scores DEMO misturados
  entre as Fases 5.4 e 5.10 - RESOLVIDO na Fase 5.10.** `calculate-risk-demo.ts`
  gravava scores DEMO em todas as RiskConfigs com componentes ativos,
  inclusive a REAL (a config 4 chegou a ter 7.740 scores REAL de 2024 e 12
  DEMO de 2025). Como as competencias DEMO eram posteriores, a resolucao
  default do Radar caia numa competencia DEMO e a Visao Geral abria com 3
  municipios sinteticos. Duas correcoes, nesta ordem: (a) Fase 5.8,
  contorno de leitura - quando o cliente pede `origem` explicitamente, a
  competencia default passa a considerar a origem (`docs/fase-5.8-relatorio.md`
  #10), e a Visao Geral pede REAL por padrao; (b) Fase 5.10, correcao na
  origem - `getRiskConfigsFase2` passou a recortar pelas configs do seed
  (`autor startsWith 'seed-fase2'`) e as 372 linhas DEMO indevidas foram
  removidas em transacao. **Nao ha mais poluicao no banco**: a config 4 tem
  apenas os 7.740 scores REAL, e o DEMO legitimo (24 scores) vive so nas
  configs do seed. O contorno de leitura da Fase 5.8 foi mantido - continua
  correto e util quando o cliente pede uma origem especifica.
- **O Radar de Risco deixou de ser exclusivamente DEMO nas Fases 5.3/5.4.**
  Fase 5.3 (CNES historico via pySUS) resolveu a sobreposicao temporal
  entre SIH e CNES REAL, ativando PRESSAO_HOSPITALAR_ESTIMADA REAL. Fase
  5.4 (IPVS/SEADE, aproximacao por media ponderada) ativou VULNERABILIDADE
  REAL para os 645 municipios - com isso o Radar REAL saltou de 19 para
  **2.580 RiskScore** (645 municipios x 4 competencias, quintil
  equilibrado). `TENDENCIA`/`SEVERIDADE` REAL seguem indisponiveis (sem
  metodologia) - ver secao 10.

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
  pendentes - a cobertura SIH ingerida ate agora cobre 4 competencias de um
  unico ano, insuficiente para validar isso em definitivo):**
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
  territorial (GeoJSON), **e para populacao estimada anual (Fase 5.2)** -
  `etl/ingest_populacao.py` carrega a estimativa anual do IBGE (tabela SIDRA
  6579, TOTAL por municipio, sem quebra etaria/sexo) em `gold.PopulacaoEstimada`
  para 2024 e 2025. **Censo 2022 (tabela 9514, quebra real por idade/sexo)
  continua investigado mas nao implementado** - so teria valor pratico
  quando alguma competencia SIH REAL de 2022 existir no catalogo pysus, o
  que nao foi verificado. Com populacao estimada REAL agora existindo,
  `TAXA_INTERNACAO_10K_HAB` (o indicador OBSERVADO que fundamenta TENDENCIA)
  ja e calculado com origem REAL (`calculate-indicadores-real.ts`) - mas com
  cobertura de apenas 1 municipio (Sao Paulo capital) para 2024, por uma
  razao estrutural do dado REAL, nao uma lacuna de codigo - ver secao 10. O
  componente TENDENCIA do Radar em si (variacao em janela movel com
  sazonalidade) continua indisponivel, sem definicao metodologica.

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
- **A API serve fato bruto agregado desde a Fase 5.7, sempre com a supressao
  ja decidida na ingestao.** Ate a Fase 5.6 a API so servia
  `RiskScore`/`RiskComponenteValor`/`IndicadorMunicipal` ja materializados.
  A Fase 5.7 acrescentou `GET /api/indicadores/municipios` com os
  indicadores `INTERNACOES` e `OBITOS_ONCOLOGICOS`, que sao fato bruto
  agregado - e a Fase 5.8 acrescentou `GET /api/fluxo/*`. A preocupacao
  original desta secao (soma ingenua via `SUM()` subestimando um total
  incompleto) foi tratada, nao herdada: esses endpoints leem tabelas cujo
  grao JA E o grao final (`gold.FatoObitoResidencia`, Fase 5.6;
  `gold.FatoInternacaoResidenciaAnual`, Fase 5.10; `gold.FatoFluxoInternacao`,
  Fase 5.8), onde a regra n<5 foi decidida UMA vez sobre o total, no ETL,
  a partir do dado bruto - nunca somando celulas ja suprimidas. Onde a
  agregacao ainda acontece na leitura (`bool_or` no SQL de
  `packages/db/src/repositories/risk.ts`), a celula suprimida anula o total,
  nunca vira uma soma parcial. A API so repassa os campos nulos como estao -
  nunca os transforma em `0` (verificado por teste automatizado em
  `apps/api/src/__tests__/risk.test.ts`,
  `indicadores-municipios.test.ts` e `fluxo.test.ts`). A regra continua
  valendo para qualquer endpoint FUTURO que venha a agregar fato bruto: a
  supressao precisa ser decidida no grao publicado, nunca reconstruida.
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
- **Agregacao por Regiao de Saude existe para o Radar (Fase 5.5), nao para
  os demais indicadores.** `GET /api/risk/regioes`,
  `/api/risk/regioes/:id` e `/api/risk/regioes/:id/components` servem
  `RiskScoreRegional`/`RiskComponenteValorRegional` (17 DRS x 12
  competencias), calculados de forma independente a partir do dado bruto -
  nunca somando fatos municipais ja suprimidos. O que continua NAO
  existindo: endpoint regional para os indicadores fora do Radar
  (mortalidade oncologica, taxa de internacao, vulnerabilidade, fluxo
  assistencial) - esses so existem no grao municipal. O card "Radar por
  Regiao de Saude" da Visao Geral tambem continua sendo agrupamento
  client-side dos RiskScore municipais (join entre `/api/municipios` e
  `/api/risk`, ver `apps/web/app/page.tsx`), e NAO consome
  `/api/risk/regioes` - as duas leituras coexistem e nao devem ser
  confundidas: o endpoint regional e um calculo independente sobre o dado
  bruto regional, o card e uma visualizacao dos indices municipais
  arrumados por DRS.

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
  `apps/api/src/services/risk.service.ts`, corrigida na auditoria de
  Fase 5/5.1): `RiskConfig` oficial se existir, senao a mais recente com
  componentes ativos (resolvida ANTES da competencia, ja que o default de
  competencia depende dela); competencia mais recente por `dataRef` **que
  tenha RiskScore** para o riskConfig resolvido - nunca a mais recente por
  data pura, porque uma competencia pode existir so por causa de uma
  ingestao geografica/de capacidade (ex.: o snapshot do CNES, sempre
  carimbado no mes corrente da ingestao) sem nenhum RiskScore, o que fazia
  o Radar abrir vazio por padrao antes da correcao (ver
  `apps/api/src/__tests__/risk.test.ts`, teste de regressao). Quando o
  cliente informa `competenciaId` explicitamente, a API nunca troca por
  outra - devolve lista/`data:null` vazios se aquela competencia nao tiver
  o dado pedido (ver tambem `apps/api/src/__tests__/municipios.test.ts`).
  Origem nao filtrada por padrao, mas a API responde `409 ORIGEM_AMBIGUA` se
  mais de uma origem estiver presente no resultado - nunca mistura REAL e
  DEMO silenciosamente numa mesma lista.
- **Nenhum endpoint de escrita/administracao de `RiskConfig`** foi criado -
  toda `RiskConfig` usada pela API vem do que ja foi semeado/calculado pelas
  Fases 1/2.
- Paginacao com teto de 200 itens por pagina - nao testada contra volume
  real (a base DEMO atual tem poucas dezenas de linhas por tabela).

## 9. Frontend / Dashboard (Fase 4, mapa atualizado na Fase 5)

- **Mapa geografico implementado na Fase 5** (`apps/web/components/charts/map.tsx`),
  usando o GeoJSON real de SP (`apps/web/public/geo/sp-municipios.geojson`,
  fonte IBGE, ver `apps/web/public/geo/README.md`) renderizado em SVG puro
  (sem Leaflet). O mapa mostra os 645 municipios REAIS com sua geometria
  oficial. **Desde as Fases 5.3/5.4 o Radar e calculado sobre a base REAL**:
  todos os 645 municipios recebem classificacao em todas as competencias com
  Radar (7.740 RiskScore REAL), graças a renormalizacao de pesos - o indice
  e composto com os componentes disponiveis mesmo onde PRESSAO_HOSPITALAR_
  ESTIMADA falta (ela so existe em 4 das 12 competencias, secao 10). A cor
  neutra/"sem indice calculado" continua aparecendo quando os filtros atuais
  (competencia/origem/riskConfig) nao tem score para aquele municipio -
  estado honesto, nao um bug. Clique navega para o detalhe do municipio.
  A Fase 5.7 generalizou o mesmo componente (props opcionais `corPorCodigo`/
  `tooltipPorCodigo`/`onClickMunicipio`) para o Radar Municipal, sem alterar
  o comportamento anterior quando elas sao omitidas.
- **Defeito de projecao do mapa CORRIGIDO na etapa E2 do redesign.** Ate
  entao o mapa desenhava Sao Paulo **49,8% mais alto** do que o estado e: a
  correcao de longitude por cosseno era aplicada e, na linha seguinte,
  anulada por uma escala independente por eixo que encaixava o resultado numa
  caixa quadrada (`sx = 640/dx`, `sy = 640/dy`, com `dx/dy = 1,498`). Agora ha
  uma unica escala para os dois eixos e a altura do viewBox e derivada da
  geometria - razao desenhada 1,498, identica a do territorio. O mapa tambem
  ganhou zoom/pan (pelo viewBox, sem tocar nos 645 caminhos), navegacao por
  teclado com anuncio em `aria-live`, tooltip preso a viewport e legenda com
  contagem por faixa. Ver `docs/design-system.md` #8.
- **Escala de cor do risco trocada na etapa E1 do redesign.** A escala
  anterior (esmeralda -> azul -> ambar -> laranja -> vermelho) ciclava o matiz
  sem ordenacao de luminancia: o mapa lia como confete e a ordem entre dois
  municipios nao era perceptivel. Foi substituida por uma rampa sequencial de
  luminancia decrescente, legivel sob daltonismo. **Nenhum limiar,
  classificacao ou valor foi alterado** - so a cor com que sao desenhados.
- **Quatro estados de ausencia de dado agora tem componente proprio**
  (`components/states/suppressed-value.tsx`): zero real, suprimido (n<5), sem
  registro e sem metodologia. A aplicacao nas telas e **progressiva** (etapas
  E4-E7); ate la o `UnavailableNote` generico continua em uso no detalhe de
  municipio e nos componentes do Radar.
- **Filtros da UI limitados aos que a API suporta.** `/api/risk` (Fase 3) so
  aceita `competenciaId`/`riskConfigId`/`origem` - por isso a UI so oferece
  filtro global de competencia e origem (sincronizados com a URL, via
  `useRiskFiltersUrl`/`FilterBar`, usado em `/`, `/radar` e
  `/municipios/[id]`). Filtro de classificacao (Radar) e de regiao/busca
  (Municipios) sao filtros client-side sobre a lista ja carregada da API,
  nao nova consulta ao servidor. Nao ha filtro de sexo, faixa etaria ou
  municipio no Radar porque a API nao os expoe - criar um filtro decorativo
  que nao muda o dado buscado foi evitado deliberadamente.
- **Propagacao de competencia entre paginas (corrigido na Fase 5.1).** Ate a
  Fase 5.1, `/municipios/[id]` ignorava a competencia selecionada em
  `/`/`/radar` e sempre mostrava o RiskScore mais recente do municipio -
  clicar num municipio filtrado por uma competencia especifica perdia esse
  filtro silenciosamente. Corrigido: os links para o detalhe do municipio
  (`apps/web/lib/use-risk-filters.ts:buildMunicipioHref`) carregam a
  competencia/riskConfig/origem da pagina de origem, e o detalhe do
  municipio le esses parametros da URL. Quando a competencia selecionada
  nao tem RiskScore para aquele municipio especifico, a pagina mostra
  "Sem dados disponiveis para esta competencia" (nunca substitui pela mais
  recente do municipio) e lista as competencias em que ha dado, se houver.
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
- Testes automatizados de `apps/web` nao foram criados na Fase 4 (o
  projeto nao tinha tooling de teste de frontend); a validacao foi feita via
  `typecheck`, `lint`, `build` de producao e verificacao manual das paginas
  no navegador - ver `docs/fase-4-relatorio.md`. **A Fase 5.11 introduziu o
  vitest em `apps/web`**, mas so para logica pura (`lib/fluxo-arcos.ts`, 19
  testes). Nao ha teste de componente nem de ponta a ponta: o restante da
  interface continua validado so no navegador.
- **Fluxo Assistencial (Fase 5.11) mostra um municipio por vez.** Nao ha
  visao estadual com todos os pares de uma vez: exigiria um endpoint novo
  (os existentes devolvem os pares de UM municipio ou o ranking de polos),
  que nao foi criado. A visao de entrada usa o ranking de polos
  (`/api/fluxo/polos`, no maximo 50). `lib/fluxo-arcos.ts` e a camada do
  mapa nao dependem da origem dos dados, entao a visao estadual, se
  aprovada, e um novo consumidor e nao uma reescrita.
- **O mapa de fluxo desenha so o fluxo VISIVEL.** Par com menos de 5
  internacoes no ano e suprimido (Fase 5.8) e nunca vira arco nem entra em
  soma - aparece como contagem declarada e numa lista de nomes. Em municipios
  pequenos isso pode significar nenhum arco: Pracinha, por exemplo, tem 5
  pares de saida, todos suprimidos, e a pagina diz exatamente isso em vez de
  mostrar "0". O volume real e sempre maior ou igual ao desenhado.
- **"Recebidas de fora" no modo destino e soma de apresentacao** sobre as
  entradas visiveis que a API ja devolveu (o endpoint so traz resumo do lado
  origem). A soma e identica ao `internacoesRecebidasDeFora` que
  `/api/fluxo/polos` calcula no servidor - fixado por teste de API.
- **Arcos ligam centroides**, nao enderecos de hospital: indicam municipio de
  residencia -> municipio de internacao, nao a rota percorrida. A espessura
  usa escala de raiz quadrada para que fluxos pequenos continuem visiveis ao
  lado de fluxos grandes; o numero exato fica no ranking.
- **Rotulos do mapa de fluxo nao evitam colisao.** Os 3 maiores fluxos (5
  maiores polos) sao rotulados; municipios vizinhos podem sobrepor rotulos
  (ex.: Barra Bonita e Lencois Paulista, ao lado de Jau). O ranking lateral e
  a leitura exata; o zoom separa os rotulos.

## 10. Ingestao REAL (Fase 5)

- **SIH/SUS: bloqueio de ambiente contornado com Docker, dado REAL ingerido
  para 4 competencias de 2024 (segunda rodada da Fase 5 + expansao na Fase
  5.1).** `pysus` continua impossivel de instalar no Python principal do
  host (Windows) - `pyreaddbc` so publica wheel pre-compilado para Linux,
  nao para Windows, e compilar do zero exigiria Microsoft Visual C++ Build
  Tools. Contornado com um container Linux dedicado
  (`etl/docker/Dockerfile.sih`, `pyreaddbc` tem wheel Linux pronto) que roda
  so a ingestao SIH, isolado do ambiente principal e do `docker-compose.yml`
  do projeto (que continua exclusivo de PostgreSQL+Adminer). Resultado real
  apos a Fase 5.1 (2024 inteiro solicitado, catalogo so tinha 4 dos 12
  meses): 2024-02 (221.117 registros brutos, 16.016 validos, 3.467/1.177
  celulas), 2024-06 (240.552 brutos, 16.277 validos, 3.601/1.173 celulas),
  2024-08 (246.085 brutos, 16.914 validos, 3.703/1.211 celulas), 2024-12
  (225.756 brutos, 15.427 validos, 3.461/1.182 celulas) - todos com
  supressao n<5 aplicada e idempotencia confirmada (reexecucao completa nao
  altera nenhuma contagem/soma existente). Detalhes completos, cobertura
  por competencia e decisoes metodologicas: `docs/sih-methodology.md` §11.
- **Catalogo do pySUS para SIH/SP nao e continuo.** Confirmado ao expandir
  para o ano de 2024 inteiro na Fase 5.1: de 12 competencias solicitadas,
  so 4 (02, 06, 08, 12) estavam no catalogo espelhado - as demais (01, 03,
  04, 05, 07, 09, 10, 11) foram reportadas como ausentes, nunca preenchidas
  com dado inventado. A causa da lacuna (DATASUS vs. espelho do pySUS) nao
  foi determinada - ver `docs/sih-methodology.md` §8.
- **Pressao Hospitalar Estimada REAL continua indisponivel para as 4
  competencias SIH ingeridas** - nao por limitacao de codigo, e porque as
  duas fontes REAL que o componente precisa (`pacientesDia` do SIH,
  `leitosSus` do CNES) nao compartilham nenhuma competencia: a fonte CNES
  usada (`etl/ingest_cnes.py`) nao tem historico por competencia, so um
  snapshot preso ao mes da propria ingestao (2026-08). Matriz completa de
  sobreposicao por competencia: `docs/sih-methodology.md` §11.2.
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
- **`TAXA_INTERNACAO_10K_HAB` REAL (Fase 5.2) tem cobertura de 1 municipio
  para 2024, nao 645.** `getAgregadoInternacaoResidenciaAnual` (existente
  desde a Fase 2, reaproveitada sem alteracao) aplica `bool_or(suprimido)`
  sobre TODAS as celulas (`faixaEtaria x sexo`) de TODAS as 4 competencias
  REAL do ano - uma unica celula suprimida (`n<5`) em qualquer mes torna o
  total anual do municipio inteiro `NULL`, nunca uma soma parcial. 642 dos
  645 municipios REAL tem pelo menos 1 celula SIH REAL em 2024, mas so 1
  (Sao Paulo capital) nao tem nenhuma celula suprimida no ano inteiro -
  internacao oncologica e um evento raro por municipio/mes, entao quase
  todo municipio fora da capital tem ao menos uma combinacao faixaEtaria x
  sexo abaixo do limiar em algum dos 4 meses. **Nao e um bug**: e a regra de
  supressao (`NULL != 0`) funcionando como desenhada, agora exposta a dado
  REAL esparso em vez da base DEMO (mais densa por construcao). Nao ha
  correcao de codigo que amplie essa cobertura sem flexibilizar a regra de
  supressao - ver `docs/fase-5.2-relatorio.md` #5.1 e #9.
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
- **CNES historico REAL (Fase 5.3, grupo LT via pySUS) e o primeiro Radar
  REAL.** `etl/ingest_cnes_historico.py` ingeriu capacidade de leitos REAL
  por competencia (nao snapshot) para as 4 competencias ja cobertas por SIH
  REAL - a sobreposicao que faltava para Pressao Hospitalar Estimada REAL.
  `calculate-risk-real.ts` calculou 19 `RiskScore` REAL. So CIRURGICO/CLINICO/OUTRO
  sao gravados por esta fonte (nunca UTI - o subcodigo que distinguiria UTI
  dentro de "Complementar" foi reclassificado pela Portaria SAES/MS mais de
  uma vez e nao foi confirmado com uma tabela unica e estavel). Detalhes:
  `docs/fase-5.3-relatorio.md`, `docs/sih-methodology.md` §12.
- **Vulnerabilidade social (IPVS/SEADE) implementada na Fase 5.4, como
  aproximacao aprovada explicitamente pelo usuario.** O unico recurso
  maquina-legivel encontrado esta em grao de **setor censitario** (nao
  municipio), 83,5 MiB, com licenca nao declarada na pagina do recurso
  ("Nenhuma Licenca Fornecida") - diferente das demais fontes REAL do
  projeto. `etl/ingest_vulnerabilidade.py` agrega por municipio via media
  ponderada por populacao (82,9% de cobertura de setores) - um CALCULO
  deste projeto, nao um produto oficial da SEADE, por isso gravado com
  natureza `ESTIMATIVA` (nunca `OBSERVADO`). Ver
  `docs/fase-5.4-relatorio.md`.
- **Fragilidade de versao do `pysus` nos containers Docker de ETL (achado
  na Fase 5.6).** `requirements-sih.txt`/`requirements-cnes-historico.txt`
  usam `pysus>=2.8,<3` (faixa aberta) - reconstruir essas imagens do zero
  hoje resolveria uma versao mais nova (`2.11.0`, confirmado) cuja API
  interna usada por este projeto (`pysus.api._impl.databases.PySUS`) nao
  existe mais no mesmo caminho, quebrando a ingestao com `ImportError`.
  `requirements-sim.txt` (Fase 5.6) ja foi corrigido fixando `pysus==2.8.0`;
  os outros dois containers **continuam vulneraveis** a esse problema se
  suas imagens forem reconstruidas (o problema so nao aparece hoje porque
  as imagens ja construidas ficam em cache local, com a versao antiga).
- **O catalogo do pySUS para SIH-SP 2024 deixou de ser incompleto (achado
  durante a recuperacao da Fase 5.6, nao causado por ela).** As entradas
  acima ("so 4 competencias: 02/06/08/12", "1 municipio de cobertura para
  `TAXA_INTERNACAO_10K_HAB`") descrevem o estado observado nas Fases
  5.1/5.2 - ao reexecutar `etl/ingest_sih.py` do zero numa recuperacao de
  banco (ver `docs/fase-5.6-relatorio.md` #9), o catalogo espelhado passou
  a servir as **12 competencias completas de 2024**, sem nenhuma mudanca de
  codigo (`COMPETENCIAS_POC` ja pedia o ano inteiro desde a Fase 5.1). Isso
  triplicou a cobertura REAL de SIH/CNES-historico/RiskScore(Regional) e
  quebrou 6 asserções com contagem fixa (`x 4`) em
  `fase5.3.test.ts`/`fase5.4.test.ts`/`fase5.5.test.ts`, alem de uma que
  espera uma `RiskConfig` intermediaria (`fase5.3-real`) que
  `calculate-risk-real.ts` no estado atual do codigo nao recria mais (cria
  direto `fase5.4-real`). **Nao corrigido** - pendencia para uma fase
  dedicada de atualizar os numeros documentados nas Fases 5.1-5.5 e os
  testes correspondentes; nao e uma regressao de dado nem de RiskScore, so
  documentacao/teste desatualizados por uma fonte externa ter publicado
  mais dado do que tinha antes.
- **`calculate-risk-demo.ts` precisou ser corrigido nesta fase** para
  filtrar explicitamente os municipios DEMO (`getMunicipios(prisma, {
  apenasDemo: true })`) - antes da correcao, o script processava tambem os
  645 municipios REAL (sem nenhum fato DEMO associado), o que alem de
  degradar a performance (~300s -> ~11s apos a correcao) gravava
  `RiskComponenteValor` com `origem: 'DEMO'` para municipios REAIS. Os
  dados incorretos gerados antes da correcao foram apagados do banco antes
  de fechar a Fase 5 - ver `docs/fase-5-relatorio.md`.
