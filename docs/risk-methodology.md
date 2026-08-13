# Metodologia do Radar de Risco Regional

> Estado: Fase 2 concluida. O motor esta implementado em `packages/risk` e
> executa sobre a base DEMO. **Isso nao significa que a metodologia esta
> completa** - varias definicoes que este documento sempre deixou em aberto
> (normalizacao, classificacao, confiabilidade) tinham que ser resolvidas
> para o motor rodar, e foram resolvidas com escolhas PROVISORIAS,
> explicitamente marcadas como tal ao longo deste documento. Nenhum peso e
> nenhum corte de classificacao e oficial. Detalhes de implementacao e
> lacunas: [`docs/fase-2-relatorio.md`](fase-2-relatorio.md).

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

**Implementado (Fase 2)**, exatamente como especificado acima:
`packages/risk/src/components/pressaoHospitalar.ts`. `leitos-dia` usa a soma
de `leitosSus` de **todos** os tipos de leito do municipio (nao so
"oncologicos" - o schema nao segrega capacidade por especialidade, lacuna ja
registrada na Fase 1). Quando `pacientesDia` agregado do municipio+competencia
inclui qualquer celula suprimida (n<5), ou quando o total de leitos e zero, o
componente fica `disponivel = false` (nunca substitui por zero).

### 2.2 Tendencia

Variacao da taxa por 10 mil habitantes em janela movel, com tratamento de
sazonalidade. Eixo: **municipio de residencia** (indicador populacional).
Natureza: `OBSERVADO`.

**Estado na Fase 2: estruturalmente pronto, sempre `disponivel = false`.**
Esta secao nunca definiu o tamanho da janela movel nem o metodo de
tratamento de sazonalidade - dois parametros necessarios para calcular
"variacao", nao so a taxa. Implementar um dos dois por conta propria seria
inventar metodologia, o que este projeto proibe explicitamente. A base DEMO
da Fase 1/2 tambem so cobre 6 competencias de um unico ano, insuficiente
para qualquer tratamento de sazonalidade real.

O que **e** computavel e implementado: a taxa de internacao por 10.000
habitantes em si (sem a variacao), como um `IndicadorDefinicao`
(`TAXA_INTERNACAO_10K_HAB`) materializado em `IndicadorMunicipal` - natureza
`OBSERVADO`, eixo `RESIDENCIA`, direcao `MAIOR_PIOR`. Grao anual (o mesmo de
`IndicadorMunicipal`), agregando as competencias do ano; se qualquer
competencia tiver celula suprimida para o municipio, o indicador anual
tambem fica indisponivel (mesma regra de nao tratar supressao como zero).

**Decisao pendente**: definir janela movel e metodo de sazonalidade antes de
TENDENCIA poder contribuir ao indice.

### 2.3 Severidade

Composto de permanencia media, proporcao de diarias de UTI e letalidade
hospitalar. Eixo: **municipio de internacao**. Natureza: `OBSERVADO`.

Cuidado metodologico: letalidade hospitalar mais alta em municipios-polo pode
refletir a complexidade dos casos recebidos, nao pior desempenho. O indicador
mede pressao assistencial, nao qualidade.

**Estado na Fase 2: estruturalmente pronto, sempre `disponivel = false`.**
Os 3 sub-indicadores (permanencia media, proporcao de diarias de UTI,
letalidade) estao implementados e testados individualmente
(`packages/risk/src/components/severidade.ts`), mas este documento nunca
definiu pesos nem formula para combina-los num unico valor de severidade -
diferente do indice final do Radar, que tem um mecanismo explicito de pesos
versionados (`RiskConfig`/`RiskConfigComponente`). Nao existe equivalente
para os sub-componentes de severidade. Inventar essa combinacao, ainda que
com pesos iguais, seria inventar um criterio clinico de gravidade - proibido
explicitamente para este componente.

**Decisao pendente**: definir como permanencia media, proporcao de diarias
de UTI e letalidade se combinam num unico valor de severidade (com ou sem
pesos, e se sim, quais).

### 2.4 Vulnerabilidade

**Fonte ainda nao definida** (decisao adiada). A arquitetura ja acomoda a
definicao posterior: o componente aponta para um `IndicadorDefinicao`
configuravel, com fonte, unidade, periodicidade e direcao (maior e pior ou menor
e pior). Definir o indicador na Fase 5 nao exigira alteracao de arquitetura nem
migracao de schema.

Enquanto o indicador nao existir, o indice e calculado com os pesos
**renormalizados** sobre os componentes disponiveis, e a ausencia e registrada e
exibida. O produto funciona sem vulnerabilidade, sem fingir que ela existe.

**Implementado (Fase 2)**: a arquitetura plugavel funciona
(`packages/risk/src/components/vulnerabilidade.ts` aceita um valor ja
resolvido via `IndicadorDefinicao`, quando configurado). Nenhuma
`RiskConfigComponente` desta fase aponta um `indicadorDefinicaoId` para
VULNERABILIDADE - continua indisponivel, exatamente como previsto acima.
Nenhuma fonte foi inventada.

## 3. Normalizacao

Os quatro componentes tem unidades incomparaveis. A normalizacao proposta e por
**percentil dentro da coorte** (municipios de SP na mesma competencia).

Justificativa: a capital e um outlier estrutural de volume. Uma normalizacao
min-max comprimiria todos os demais municipios contra o zero, tornando o ranking
ilegivel.

**Implementado (Fase 2)** exatamente como especificado:
`packages/risk/src/normalization.ts`. Rank percentil com tratamento de
empates por rank medio (necessario para determinismo - nao especificado
neste documento, decisao de implementacao). A coorte, por componente e
competencia, e formada apenas pelos municipios com o componente disponivel
(nao suprimido).

## 4. Composicao e classificacao

- indice = soma ponderada dos componentes normalizados, com pesos vindos de
  `RiskConfig`;
- resultado em escala 0-1;
- classificacao em cinco faixas: CRITICO, ALTO, MEDIO, BAIXO, MUITO_BAIXO.

**Composicao implementada (Fase 2)** conforme especificado, com
renormalizacao dos pesos quando um componente esta indisponivel (a mesma
regra documentada na secao 2.4 para VULNERABILIDADE, aplicada de forma
uniforme a qualquer componente ausente): `packages/risk/src/score.ts`
(`calcularScore`). Como TENDENCIA e SEVERIDADE ficam sempre indisponiveis
nesta fase (secoes 2.2 e 2.3), na pratica o indice hoje reflete
essencialmente PRESSAO_HOSPITALAR_ESTIMADA (e VULNERABILIDADE, quando/se
configurada) - **nao os quatro componentes**. Isso nao e uma limitacao do
motor, e reflexo direto das lacunas metodologicas ja documentadas acima.

O criterio de corte das faixas ainda esta em aberto: quintis relativos da
distribuicao estadual da competencia, ou cortes absolutos fixos. Decisao
necessaria antes da Fase 2.

**Implementado como PROVISORIO (Fase 2), NAO CONFIRMADO como metodo
oficial**: quintis relativos da coorte (`classificarPorQuintil` em
`packages/risk/src/score.ts`), a competencia de cada municipio com indice
disponivel. Escolhido entre as duas opcoes por ser a unica que nao exige
inventar numeros de corte (cortes absolutos exigiriam escolher valores como
0.2/0.4/0.6/0.8 sem base documentada) e por ser a extensao mecanica direta da
normalizacao por percentil ja adotada na secao 3. **Decisao pendente**:
confirmar formalmente se quintis relativos e mesmo o metodo escolhido, ou se
cortes absolutos fixos devem substitui-lo - a redacao original deste
documento ("decisao necessaria antes da Fase 2") nunca foi resolvida por
quem define a metodologia, so contornada de forma explicita e reversivel
para permitir o motor funcionar.

## 5. Confiabilidade

Municipios com volume abaixo de um limiar recebem marcacao de **confiabilidade
baixa**. Sem isso, municipios de poucos milhares de habitantes lideram o ranking
por ruido estatistico, e o produto passa a apontar para o lugar errado.

Municipios com confiabilidade baixa sao exibidos com marcacao distinta e nao
ocupam o topo do ranking por padrao.

**Implementado (Fase 2)**: `packages/risk/src/reliability.ts`
(`calcularConfiabilidade`), usando `RiskConfig.limiarVolumeMinimo` como o
limiar. **Lacuna nao resolvida**: este documento define apenas o corte de
`BAIXA` (abaixo do limiar). Nao ha um segundo limiar que distinga `ALTA` de
`MEDIA` - por isso a implementacao **nunca retorna `MEDIA`**, so `ALTA` ou
`BAIXA`. Definir um segundo limiar (se necessario) e decisao pendente.
Confiabilidade do `RiskScore` agregado (nao so de um componente) tambem nao
tem regra definida aqui - a implementacao usa a pior confiabilidade entre os
componentes que efetivamente contribuiram peso ao indice, decisao de
implementacao documentada no codigo, nao deste documento.

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

**Implementado (Fase 2)**: o motor nunca hardcoda peso nenhum - toda
`calcularScore()` recebe a configuracao explicitamente. Duas `RiskConfig`
DEMO foram semeadas (`oficial = false`), com peso **igual** (0.25) entre os
4 componentes - a unica distribuicao que nao expressa nenhum julgamento de
importancia relativa entre eles, ja que nenhum valor demonstrativo real
estava disponivel nos documentos deste repositorio para reutilizar. As duas
configs variam so `limiarVolumeMinimo` (30 e 100), para demonstrar que
recalcular com config diferente cria historico novo sem apagar o anterior.
Nenhuma das duas e oficial nem deve ser tratada como recomendacao de peso.

## 7. Versionamento da metodologia

Cada mudanca de pesos, de metodo de normalizacao ou de definicao de componente
gera uma nova versao de `RiskConfig`, com autor, data e nota. Este documento
deve ser atualizado na mesma alteracao. Sem isso, um indice historico deixa de
ser reproduzivel - e um indice nao reproduzivel nao serve para decisao publica.
