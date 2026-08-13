# Limitacoes conhecidas

> Documento vivo. Toda limitacao que afeta a leitura dos numeros deve estar
> registrada aqui e refletida na interface do produto.

## 1. Estagio do projeto

- **O projeto nao esta pronto para uso operacional.** Nao deve embasar decisao
  de saude publica no estado atual.
- Fases 0-3 concluidas (Fase 2 e Fase 3 parciais - ver secoes 5 e 8): existe
  fundacao tecnica, schema de dominio, migrations, base DEMO deterministica,
  motor de risco funcional sobre essa base, e uma API REST somente-leitura
  expondo esses dados. Nao existe produto navegavel (dashboard).
- **A API (Fase 3) e publica, sem autenticacao nem RBAC efetivo** - ver
  secao 7. Nao deve ser exposta fora de ambiente de desenvolvimento.
- **O Radar de Risco calculado na Fase 2 e parcial, nao os 4 componentes
  previstos.** Ver secao 5 abaixo.

## 2. Dados

- **Dados DEMO nao sao dados oficiais.** A base DEMO (Fase 1) e sintetica,
  gerada por um script deterministico (`packages/db/src/scripts/seed-demo.ts`)
  para desenvolvimento e validacao do schema. Nenhum valor DEMO pode ser lido
  como informacao sobre a situacao real de qualquer municipio.
- **A geografia da Fase 1 tambem NAO e oficial.** O seed carrega apenas 15
  municipios ilustrativos de SP (nomes reais, de conhecimento publico) e 5
  agrupamentos de regiao de saude tambem ilustrativos. Os **codigos IBGE sao
  sinteticos** (sequencia obviamente nao-realista, ex. `3500010`) - foram
  gerados assim de proposito, para nao correr o risco de apresentar um
  codigo inventado como se fosse a tabela oficial do IBGE (o que violaria a
  regra deste projeto de nunca inventar dado apresentado como fonte oficial).
  A carga completa e oficial dos 645 municipios de SP com codigos IBGE reais
  fica pendente para quando houver uma fonte oficial machine-readable a
  ingerir (Fase 5 ou uma tarefa dedicada antes dela) - nao deve ser digitada
  de memoria.
- **Taxonomias provisorias, nao validadas contra a fonte real:**
  - `FaixaEtaria` usa corte decenal (`FX_00_09` ... `FX_80_MAIS`). Nenhum
    documento do projeto confirma que o SIH/IBGE usam exatamente esse corte;
    a granularidade real (decenal, quinquenal, ou outra) precisa ser
    confirmada antes da ingestao REAL (Fase 5), pois mudar a taxonomia depois
    de ha dados reais carregados exige migracao.
  - `TipoLeito` usa uma taxonomia simplificada (`CLINICO`, `CIRURGICO`, `UTI`,
    `OUTRO`), nao validada contra o dicionario de dados do CNES. Tambem em
    aberto se o recorte certo para a formula de Pressao Hospitalar Estimada e
    "tipo de leito" ou "habilitacao oncologica do estabelecimento" (ja
    modelada em `Estabelecimento.habilitacaoOncologica`) - ver
    `docs/risk-methodology.md`.
- **Integracao com o SIH/SUS ainda nao implementada.**
- **Integracao com o CNES ainda nao implementada.**
- **Integracao com o IBGE ainda nao implementada.**

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
- Agregacao por Regiao de Saude prevista, ainda nao implementada.

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
