# Modelo de dados (conceitual) - HealthMap Regional

> Estado: Fase 1 concluida. Todas as entidades abaixo estao implementadas em
> `packages/db/prisma/schema.prisma` e migradas para o PostgreSQL local
> (schemas `silver`/`gold`/`meta`). Este documento permanece como a
> especificacao conceitual; divergencias pontuais entre este texto e o schema
> efetivo estao anotadas inline. Detalhes de implementacao, testes e decisoes
> tomadas: [`docs/fase-1-relatorio.md`](fase-1-relatorio.md).

## 1. Principio estruturante: residencia x internacao

Esta e a decisao mais importante do modelo.

O SIH/SUS registra tanto o municipio de **residencia** do paciente quanto o
municipio onde ocorreu a **internacao**. Em Sao Paulo isso importa muito:
municipios-polo (capital, Campinas, Ribeirao Preto, Barretos) atendem pacientes
de toda a regiao. Somar as duas visoes produz numeros sem significado.

| Eixo           | Responde a pergunta                              | Usado para                                        |
| -------------- | ------------------------------------------------ | ------------------------------------------------- |
| **Residencia** | onde vivem as pessoas que adoeceram              | incidencia, taxa por 10 mil habitantes, tendencia |
| **Internacao** | onde o sistema hospitalar absorveu a demanda     | Pressao Hospitalar Estimada, capacidade           |

**Implementacao:** dois fatos distintos, e nao uma tabela com duas colunas de
municipio. Assim e impossivel somar os eixos por acidente. O eixo tambem viaja
no envelope da API (`eixoTerritorial`), para que o consumidor saiba sempre o que
o numero mede.

## 2. Enums de proveniencia

| Eixo         | Valores                                    |
| ------------ | ------------------------------------------ |
| **Origem**   | `REAL`, `DEMO`                             |
| **Natureza** | `OBSERVADO`, `ESTIMATIVA`, `PROJECAO`      |

Os quatro rotulos exigidos pelo projeto (REAL / DEMO / ESTIMATIVA / PROJECAO)
continuam sendo exibidos na interface; sao derivados da combinacao dos dois
eixos. Um numero pode ser, simultaneamente, DEMO e ESTIMATIVA - o que um enum
unico nao conseguiria representar.

Outros enums: `Sexo`, `FaixaEtaria`, `TipoLeito`, `ClassificacaoRisco`
(CRITICO, ALTO, MEDIO, BAIXO, MUITO_BAIXO), `Confiabilidade` (ALTA, MEDIA,
BAIXA), `ComponenteRisco`, `Perfil`.

**Implementado na Fase 1 - `FaixaEtaria` (decenal, PROVISORIA):** `FX_00_09`,
`FX_10_19`, `FX_20_29`, `FX_30_39`, `FX_40_49`, `FX_50_59`, `FX_60_69`,
`FX_70_79`, `FX_80_MAIS`. Nao ha confirmacao de que o SIH/IBGE usam
exatamente este corte - revisar quando a ingestao REAL (Fase 5) definir a
granularidade real. Ver `docs/known-limitations.md`.

**Implementado na Fase 1 - `TipoLeito` (simplificada, PROVISORIA):**
`CLINICO`, `CIRURGICO`, `UTI`, `OUTRO`. Taxonomia nao validada contra o
dicionario de dados real do CNES.

**Decisao final sobre `Natureza` nos fatos brutos:** `FatoInternacaoResidencia`,
`FatoInternacaoLocal`, `FatoCapacidadeLeitos` e `Populacao` **nao** tem coluna
`natureza` - e sempre `OBSERVADO` por construcao e nao e persistida.
`IndicadorMunicipal` usa a natureza fixa de `IndicadorDefinicao.naturezaPadrao`.
Apenas `RiskComponenteValor` e `RiskScore` persistem `natureza` por linha,
porque so ali ela pode variar (ex.: `VULNERABILIDADE` indisponivel hoje,
definida amanha).

## 3. Dimensoes (`silver`)

| Entidade         | Campos-chave                                                                              | Notas                                                          |
| ---------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `RegiaoSaude`    | codigo, nome, uf                                                                           | Permite a agregacao regional futura                            |
| `Municipio`      | codigoIbge7 (unico), codigoIbge6, nome, uf, regiaoSaudeId, latitude, longitude              | `codigoIbge6` guardado para juncao com o SIH; UF e campo        |
| `Competencia`    | ano, mes, dataRef, diasNoMes                                                                | `diasNoMes` e insumo direto de leitos-dia                      |
| `GrupoCid`       | codigo, descricao, agrupamento, capitulo                                                    | Recorte C00-C97; `agrupamento` permite corte por topografia    |
| `Estabelecimento`| codigoCnes, nome, municipioId, tipo, habilitacaoOncologica                                  | O municipio aqui e sempre o de **internacao**                  |

**Nota sobre a carga geografica (atualizada na Fase 5):** a tabela `Municipio`
agora tem duas populacoes coexistindo pelo prefixo do `codigoIbge7`, nunca
misturadas:

- **REAL** (`35xxxxx`, 645 linhas): os 645 municipios oficiais de Sao Paulo,
  ingeridos da API do IBGE (`etl/ingest_geografia.py`), com `codigoIbge6`/
  `codigoIbge7` reais, `regiaoSaudeId` apontando para um dos 17 DRS oficiais
  (fonte: SES-SP, ver `etl/reference-data/README.md`), e `latitude`/
  `longitude` como centroide aproximado (media de vertices do poligono do
  IBGE - nao o centroide de area exato, ver docstring de
  `centroide_aproximado` em `ingest_geografia.py`).
- **DEMO** (`36xxxxx`, 15 linhas): a mesma base ilustrativa da Fase 1, com
  codigos sinteticos que usam um prefixo (`36`) que nao e UF valida em nenhum
  estado brasileiro - escolhido deliberadamente para garantir zero colisao
  com qualquer codigo IBGE real (ver `packages/db/src/scripts/seed-demo.ts`).

O Radar de Risco (`RiskScore`/`RiskComponenteValor`) so e calculado sobre os
municipios DEMO nesta fase - `calculate-risk-demo.ts` filtra explicitamente
por `codigoIbge7` prefixo `36` (`getMunicipios(prisma, { apenasDemo: true })`)
para nao gerar linhas com `origem: 'DEMO'` para os 645 municipios REAIS, que
nunca fizeram parte do seed. Ver `docs/fase-5-relatorio.md`.

## 4. Fatos - eixo residencia (`gold`)

**`FatoInternacaoResidencia`**
Grao: municipio de residencia x competencia x grupo CID x faixa etaria x sexo.
Medidas: internacoes, obitos, diasPermanencia, suprimido, execucaoId, origem.

**`Populacao`** - municipio x ano x faixa etaria x sexo -> populacao.

**`PopulacaoEstimada`** (Fase 5.2) - municipio x ano -> populacaoTotal, origem,
execucaoId. Complementar a `Populacao`: a estimativa anual do IBGE (tabela
SIDRA 6579) so publica o TOTAL por municipio - sem quebra por faixa
etaria/sexo, que so existe em ano de Censo. Usada como denominador de
`TAXA_INTERNACAO_10K_HAB` para anos nao-censitarios (ver
`docs/fase-5.2-relatorio.md`); nunca alimenta `Populacao` (evita inventar uma
distribuicao etaria/sexo que a fonte nao da).

**`IndicadorMunicipal`** - municipio x ano x indicadorDefinicaoId -> valor,
denominador, origem. Entidade generica: e ela que permite definir o indicador de
vulnerabilidade social depois, sem alterar a arquitetura.

> **Atencao ao grao (aprendido na Fase 2):** o grao e ANUAL, nao mensal. Um
> indicador derivado de fatos mensais (como a taxa de internacao por 10k
> habitantes, calculada a partir de `FatoInternacaoResidencia`) precisa ser
> agregado para o ano ANTES de gravar aqui - gravar um valor por competencia
> direto nesta tabela sobrescreve silenciosamente o mes anterior via upsert
> (a chave unica e municipio+ano+indicador, sem competencia). Ver
> `packages/db/src/repositories/risk.ts` (`getAgregadoInternacaoResidenciaAnual`)
> para o padrao correto.

## 5. Fatos - eixo internacao (`gold`)

**`FatoInternacaoLocal`**
Grao: municipio de internacao x competencia x grupo CID x faixa etaria x sexo.
Medidas: internacoes, pacientesDia, diariasUti, obitos, suprimido, execucaoId,
origem.

**`FatoCapacidadeLeitos`**
Grao: municipio de internacao x competencia x tipo de leito.
Medidas: leitosSus, leitosTotais, leitosDia (derivado), origem.

> Nota: leitos do CNES sao autodeclarados e agregados por municipio, nao por
> estabelecimento. Qualquer indicador derivado deles e **estimativa**.

## 6. Camada de risco

| Entidade                | Papel                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `IndicadorDefinicao`    | chave, nome, fonte, unidade, periodicidade, direcao (MAIOR_PIOR/MENOR_PIOR), nota metodologica      |
| `RiskConfig`            | versao, metodo de normalizacao, limiar de volume minimo, vigencia, autor, `oficial` (bool)          |
| `RiskConfigComponente`  | componente, peso, indicadorDefinicaoId opcional, parametros, ativo                                  |
| `RiskComponenteValor`   | municipio x competencia x config x componente -> valorBruto, valorNormalizado, natureza, confiabilidade |
| `RiskScore`             | municipio x competencia x config -> indice (0-1), classificacao, confiabilidade, natureza, origem   |

Duas decisoes de modelagem que carregam intencao:

- os **pesos ficam em tabela filha**, nao em quatro colunas: acrescentar um
  quinto componente nao exigira migracao de schema;
- a chave de `RiskScore` inclui `riskConfigId`: recalcular com pesos novos
  **cria** linhas, nunca sobrescreve. Um alerta emitido em marco continua
  reproduzivel em setembro.

Fases posteriores acrescentam `Projecao` (Fase 7) e `Alerta` (Fase 6).

**Estado apos a Fase 2:** `RiskComponenteValor` e `RiskScore` estao
populadas pelo motor (`packages/risk`, orquestrado por
`packages/db/src/scripts/calculate-risk-demo.ts`). Nem todos os 4
componentes calculam valor - TENDENCIA e SEVERIDADE ficam estruturalmente
prontos mas sempre `disponivel = false` (lacunas metodologicas documentadas
em `docs/risk-methodology.md` #2.2 e #2.3, nao implementadas por decisao
explicita de nao inventar formula). Detalhes completos:
`docs/fase-2-relatorio.md`.

**`RiskConfig` - historico da Fase 1 e Fase 2.** A linha da Fase 1
(`autor='seed-fase1'`, sem componentes, `metodoNormalizacao =
'NAO_DEFINIDO_FASE2'`) permanece intocada, como registro historico de que a
tabela existia antes de haver metodo. A Fase 2 semeou **duas novas linhas**
(`autor='seed-fase2-a'` e `'seed-fase2-b'`), cada uma com os 4 componentes
em `RiskConfigComponente` com peso **igual** (0.25 - nao ha valor
demonstrativo documentado para reutilizar, peso igual e a unica distribuicao
que nao expressa julgamento de importancia relativa), variando so
`limiarVolumeMinimo` entre as duas (30 e 100), para demonstrar que
recalcular com config diferente cria historico novo (append-only) sem
apagar o anterior. Nenhuma das tres e `oficial`. `id` de `RiskConfig`
funciona como o proprio numero de versao (nao existe campo `versao`
separado, para nao duplicar o `id`).

**Constraint adicional implementada:** no maximo uma linha de `RiskConfig`
pode ter `oficial = true` simultaneamente - garantido por um indice unico
parcial (`CREATE UNIQUE INDEX ... WHERE oficial = true`), adicionado
manualmente na migration porque o DSL do Prisma nao expressa indices
parciais.

## 7. Governanca e plataforma (`meta`)

| Entidade                                    | Papel                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| `FonteDados`                                | identificacao, URL, licenca, periodicidade, defasagem esperada           |
| `IngestaoExecucao`                          | fonte, competencia, status, hash, contagens, versao do pipeline, origem  |
| `QualidadeCheck`                            | execucao, regra, severidade (BLOQUEANTE/ALERTA), resultado, linhas afetadas |
| `AuditLog`                                  | ator, acao, recurso, filtros aplicados, timestamp, IP/user-agent         |
| `Usuario`, `PerfilAtribuicao`, `EscopoTerritorial` | criados na Fase 1 e **inertes** ate a Fase 6                      |

## 8. Regra de supressao

Celulas com contagem abaixo do limiar sao gravadas com `suprimido = true` e
medidas nulas. A regra e aplicada no ETL (na agregacao) **e reaplicada na API**
sobre combinacoes de filtros: a intersecao de filtros permissivos pode
reconstituir uma celula pequena que, isolada, estava acima do limiar.

Limiar adotado na Fase 1: `n < 5`, tratado como parametro do gerador
DEMO/ETL e documentado como sujeito a revisao metodologica/juridica futura
(nao embutido em `RiskConfig` - supressao de fatos brutos e independente do
ciclo de vida do Radar). A reaplicacao da supressao sobre combinacoes de
filtro na API **nao foi implementada** - isso e explicitamente escopo da
Fase 3. Ver `docs/known-limitations.md`.

## 9. O que o modelo nao tem, por decisao

Nao existe entidade `Paciente`, `AIH` ou `Prontuario`. O grao minimo persistido
e agregado por municipio. Isso nao e uma politica de uso: e uma impossibilidade
de modelagem, que e a forma mais confiavel de garantir a regra.
