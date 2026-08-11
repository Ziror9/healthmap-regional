# Modelo de dados (conceitual) - HealthMap Regional

> Estado: Fase 0. Nenhuma entidade implementada. Este documento descreve o
> modelo que sera criado na Fase 1, para que a implementacao seja verificavel
> contra uma especificacao previa.

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

## 3. Dimensoes (`silver`)

| Entidade         | Campos-chave                                                                              | Notas                                                          |
| ---------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `RegiaoSaude`    | codigo, nome, uf                                                                           | Permite a agregacao regional futura                            |
| `Municipio`      | codigoIbge7 (unico), codigoIbge6, nome, uf, regiaoSaudeId, latitude, longitude              | `codigoIbge6` guardado para juncao com o SIH; UF e campo        |
| `Competencia`    | ano, mes, dataRef, diasNoMes                                                                | `diasNoMes` e insumo direto de leitos-dia                      |
| `GrupoCid`       | codigo, descricao, agrupamento, capitulo                                                    | Recorte C00-C97; `agrupamento` permite corte por topografia    |
| `Estabelecimento`| codigoCnes, nome, municipioId, tipo, habilitacaoOncologica                                  | O municipio aqui e sempre o de **internacao**                  |

## 4. Fatos - eixo residencia (`gold`)

**`FatoInternacaoResidencia`**
Grao: municipio de residencia x competencia x grupo CID x faixa etaria x sexo.
Medidas: internacoes, obitos, diasPermanencia, suprimido, execucaoId, origem.

**`Populacao`** - municipio x ano x faixa etaria x sexo -> populacao.

**`IndicadorMunicipal`** - municipio x ano x indicadorDefinicaoId -> valor,
denominador, origem. Entidade generica: e ela que permite definir o indicador de
vulnerabilidade social depois, sem alterar a arquitetura.

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

Limiar configuravel. Valor proposto: n < 5 (a confirmar na Fase 1).

## 9. O que o modelo nao tem, por decisao

Nao existe entidade `Paciente`, `AIH` ou `Prontuario`. O grao minimo persistido
e agregado por municipio. Isso nao e uma politica de uso: e uma impossibilidade
de modelagem, que e a forma mais confiavel de garantir a regra.
