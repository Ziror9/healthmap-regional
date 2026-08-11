# Metodologia do Radar de Risco Regional

> Estado: Fase 0. **Nenhuma formula implementada.** Este documento fixa o
> conceito, o vocabulario e as restricoes antes que exista codigo. A formula
> efetiva sera especificada e implementada na Fase 2, em `packages/risk`.

## 1. O que o Radar e - e o que ele nao e

O Radar de Risco Regional e um **indice analitico e experimental** que ordena
municipios segundo a atencao que merecem do gestor publico.

Ele **nao e**:

- diagnostico medico;
- risco clinico individual;
- avaliacao de qualidade assistencial de qualquer hospital;
- previsao de desfecho de qualquer paciente.

Este aviso acompanha o indice em toda superficie do produto onde ele aparece,
junto da versao da configuracao, dos pesos vigentes e da competencia.

## 2. Componentes previstos

### 2.1 Pressao Hospitalar Estimada

**Vocabulario obrigatorio.** O SIH/SUS **nao informa taxa de ocupacao
hospitalar**. Ele informa internacoes e permanencia. Qualquer indicador de
ocupacao so pode ser derivado por calculo com premissas. Por isso o produto usa
o termo **Pressao Hospitalar Estimada** em todo lugar - codigo, banco, API,
interface e documentacao. A palavra "ocupacao" nao aparece como metrica
observada em nenhum ponto do sistema.

Definicao prevista:

```
pressao_estimada = pacientes-dia oncologicos / leitos-dia oncologicos SUS
```

- pacientes-dia vem da soma da permanencia das internacoes na competencia;
- leitos-dia vem do CNES (leitos SUS x dias do mes).

Limitacoes que devem ser exibidas onde o indicador for exibido:

- leitos do CNES sao **autodeclarados** e podem estar desatualizados;
- a agregacao e municipal, nao por estabelecimento: o valor nao representa a
  ocupacao de nenhum hospital especifico;
- usa o eixo **municipio de internacao**, nunca o de residencia.

Natureza: sempre `ESTIMATIVA`.

### 2.2 Tendencia

Variacao da taxa por 10 mil habitantes em janela movel, com tratamento de
sazonalidade. Eixo: **municipio de residencia** (indicador populacional).
Natureza: `OBSERVADO`.

### 2.3 Severidade

Composto de permanencia media, proporcao de diarias de UTI e letalidade
hospitalar. Eixo: **municipio de internacao**. Natureza: `OBSERVADO`.

Cuidado metodologico: letalidade hospitalar mais alta em municipios-polo pode
refletir a complexidade dos casos recebidos, nao pior desempenho. O indicador
mede pressao assistencial, nao qualidade.

### 2.4 Vulnerabilidade

**Fonte ainda nao definida** (decisao adiada). A arquitetura ja acomoda a
definicao posterior: o componente aponta para um `IndicadorDefinicao`
configuravel, com fonte, unidade, periodicidade e direcao (maior e pior ou menor
e pior). Definir o indicador na Fase 5 nao exigira alteracao de arquitetura nem
migracao de schema.

Enquanto o indicador nao existir, o indice e calculado com os pesos
**renormalizados** sobre os componentes disponiveis, e a ausencia e registrada e
exibida. O produto funciona sem vulnerabilidade, sem fingir que ela existe.

## 3. Normalizacao

Os quatro componentes tem unidades incomparaveis. A normalizacao proposta e por
**percentil dentro da coorte** (municipios de SP na mesma competencia).

Justificativa: a capital e um outlier estrutural de volume. Uma normalizacao
min-max comprimiria todos os demais municipios contra o zero, tornando o ranking
ilegivel.

## 4. Composicao e classificacao

- indice = soma ponderada dos componentes normalizados, com pesos vindos de
  `RiskConfig`;
- resultado em escala 0-1;
- classificacao em cinco faixas: CRITICO, ALTO, MEDIO, BAIXO, MUITO_BAIXO.

O criterio de corte das faixas ainda esta em aberto: quintis relativos da
distribuicao estadual da competencia, ou cortes absolutos fixos. Decisao
necessaria antes da Fase 2.

## 5. Confiabilidade

Municipios com volume abaixo de um limiar recebem marcacao de **confiabilidade
baixa**. Sem isso, municipios de poucos milhares de habitantes lideram o ranking
por ruido estatistico, e o produto passa a apontar para o lugar errado.

Municipios com confiabilidade baixa sao exibidos com marcacao distinta e nao
ocupam o topo do ranking por padrao.

## 6. Pesos configuraveis e versionados

Regras firmes:

1. **Nenhum peso e oficial ate ser calibrado e validado.** A configuracao
   inicial nasce com `oficial = false`.
2. Os numeros apresentados no material de origem do projeto sao
   **demonstrativos** e nao devem ser tratados como pesos oficiais.
3. Os pesos vivem em banco (`RiskConfig` + `RiskConfigComponente`), nunca
   embutidos em codigo.
4. Toda pontuacao calculada guarda a versao da configuracao que a produziu. O
   recalculo cria linhas novas e nunca sobrescreve o historico.
5. A interface sempre exibe qual versao esta em uso.

## 7. Versionamento da metodologia

Cada mudanca de pesos, de metodo de normalizacao ou de definicao de componente
gera uma nova versao de `RiskConfig`, com autor, data e nota. Este documento
deve ser atualizado na mesma alteracao. Sem isso, um indice historico deixa de
ser reproduzivel - e um indice nao reproduzivel nao serve para decisao publica.
