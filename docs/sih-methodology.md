# Metodologia da ingestão SIH/SUS

> Estado: implementado (segunda rodada da Fase 5, POC de 1 competência;
> expandido na Fase 5.1 para o catálogo disponível do ano de 2024 inteiro —
> ver §11). Ver [`docs/fase-5-relatorio.md`](fase-5-relatorio.md) e
> [`docs/fase-5.1-relatorio.md`](fase-5.1-relatorio.md) para os números
> exatos ingeridos e [`docs/known-limitations.md`](known-limitations.md)
> §10 para o que continua pendente.

## 1. Fonte

**Ministério da Saúde / DATASUS — SIH/SUS (Sistema de Informações
Hospitalares do SUS)**, grupo **RD** (AIH reduzida — um registro por
internação processada). Acesso via [pySUS](https://github.com/AlertaDengue/PySUS),
que hoje busca os arquivos de um bucket S3 público mantido pelo projeto
pySUS (catálogo "DuckLake"), espelho dos mesmos arquivos publicados pelo
[Portal de Transferência de Arquivos do DATASUS](https://datasus.saude.gov.br/transferencia-de-arquivos/).
Dado público (Lei de Acesso à Informação 12.527/2011).

## 2. Por que residência **e** internação (não uma escolha entre as duas)

Esta não é uma decisão nova desta ingestão — o schema já a tomou na Fase 1
(`docs/data-model.md` §1) e a ingestão SIH só a executa:

| Eixo | Campo do SIH-RD | Tabela | Usado para |
|---|---|---|---|
| Residência | `MUNIC_RES` (onde o paciente mora) | `FatoInternacaoResidencia` | incidência, taxa por 10k habitantes, tendência |
| Internação | `MUNIC_MOV` (onde a internação ocorreu) | `FatoInternacaoLocal` | Pressão Hospitalar Estimada, capacidade |

Os dois fatos são gravados a partir do **mesmo arquivo/registro**, nunca
combinados numa única linha — cada um agrega pelo seu próprio campo de
município. Um paciente residente em Bauru internado em São Paulo capital
contribui para `FatoInternacaoResidencia` de Bauru e para
`FatoInternacaoLocal` de São Paulo, nunca o contrário.

**O que significa "município" em cada eixo:** em `FatoInternacaoResidencia`,
o município é onde o paciente mora — não implica que o município tenha
capacidade hospitalar nenhuma. Em `FatoInternacaoLocal`, o município é onde
o estabelecimento está fisicamente — reflete a capacidade absorvida
localmente, não de onde vêm os pacientes. Municípios-polo (capital,
Campinas, Ribeirão Preto, Barretos) concentram `FatoInternacaoLocal` muito
acima do que sua própria população residente geraria — confirmado no POC:
591 municípios distintos em `FatoInternacaoResidencia` contra 213 em
`FatoInternacaoLocal` (mesmo arquivo, mesma competência).

## 3. Recorte oncológico (C00-C97)

Preserva a decisão da Fase 2 (`GrupoCid` = `TODAS_NEOPLASIAS_MALIGNAS`,
`codigoCidInicio='C00'`, `codigoCidFim='C97'`, linha única). `DIAG_PRINC` do
SIH-RD vem sem ponto (ex.: `C509`, `C61`) — o capítulo é sempre os 2 dígitos
após o `C`. Só registros com `DIAG_PRINC` dentro de C00-C97 entram na
agregação; nenhum outro agrupamento foi criado. Testado explicitamente para
C00, C01, C97, códigos fora do recorte, valores ausentes e códigos inválidos
(`etl/tests/test_sih_transform.py`).

## 4. Sexo e faixa etária — de-para e o que é rejeitado (não adivinhado)

**Sexo** (`SEXO`): `1`→`MASCULINO`, `3`→`FEMININO`. Qualquer outro valor
(ausente ou código não documentado) vira `IGNORADO` — um enum que o schema
já previa para exatamente este caso, não uma rejeição.

**Faixa etária** (`COD_IDADE` + `IDADE`): o dicionário oficial do SIH-RD
documenta `COD_IDADE` como `0`=ignorada, `2`=dias, `3`=meses, `4`=anos
(fonte: dicionário de variáveis SIH-SUS, PCDaS/Fiocruz). `2`/`3` mapeiam
para `FX_00_09` (menor de 1 ano); `4` usa `IDADE` diretamente no bucket
decenal correspondente. **`0` e qualquer código fora do documentado são
rejeitados, nunca classificados por suposição** — no POC real (SP,
2024-02), 4 dos 16.020 registros oncológicos (`COD_IDADE='5'`, um código
que não consta no dicionário oficial consultado) caíram nesse caso e foram
excluídos da agregação, contabilizados e reportados
(`diagnostico_sem_faixa_etaria_classificavel`), não silenciosamente
descartados.

## 5. Competência

Usa `ANO_CMPT`/`MES_CMPT` (competência de **processamento** da AIH — o
mesmo campo que nomeia o arquivo, ex.: `RDSP2402.parquet` = 2024-02), não
`DT_INTER`/`DT_SAIDA` (datas de internação/alta, que podem cair em mês
diferente para internações longas). Cada registro é checado contra a
competência esperada do arquivo (`check_competencia_arquivo_bate_com_registro`)
— no POC, 0 divergências.

## 6. Agregação e anonimização

Grão de carga: **município × competência × grupo CID (fixo) × faixa etária
× sexo**. A agregação acontece inteiramente em memória, dentro do
container de ingestão, antes de qualquer escrita no banco — nenhum campo
capaz de identificar um paciente (`N_AIH`, CPF, CEP, data de nascimento)
chega a ser gravado. Isso cumpre o invariante arquitetural do projeto
(`CLAUDE.md` #1: "não existe dado individual de paciente no banco da
aplicação").

**Medidas agregadas por célula:**
- `internacoes`: contagem de AIH na célula;
- `obitos`: soma de `MORTE` (0/1 por registro);
- `FatoInternacaoResidencia.diasPermanencia` / `FatoInternacaoLocal.pacientesDia`:
  soma de `DIAS_PERM` (mesma grandeza, nomes diferentes por eixo — já
  definido assim no schema desde a Fase 1/2, ver `docs/risk-methodology.md`
  §2.1: "pacientes-dia vem da soma da permanência das internações na
  competência");
- `FatoInternacaoLocal.diariasUti`: soma de `UTI_INT_TO` (total de diárias
  de UTI da internação — mesma granularidade "por AIH" de `DIAS_PERM`, ao
  contrário de `UTI_MES_TO`, que recorta só a fração do mês corrente e
  quebraria a correspondência 1:1 com `DIAS_PERM`).

## 7. Supressão

**A regra de supressão (n<5) é aplicada pelo HealthMap na agregação, não
herdada da fonte.** O arquivo SIH-RD bruto não vem suprimido — é dado
individual por AIH. A mesma regra já usada pelo DEMO (Fase 1) e documentada
em `docs/known-limitations.md` §5.1 é aplicada aqui pela primeira vez sobre
dado real: toda célula com `internacoes < 5` recebe `suprimido = true` e
todas as medidas numéricas viram `NULL` (nunca `0`) — verificado no POC:
2829/3467 células de `FatoInternacaoResidencia` e 710/1177 de
`FatoInternacaoLocal` foram suprimidas, e a constraint de banco
(`FatoInternacaoResidencia_supressao_check`/`FatoInternacaoLocal_supressao_check`,
já existente desde a Fase 1) confirma: nenhuma célula suprimida tem medida
não-nula.

## 8. Cobertura do catálogo espelhado (limitação real, não inventada)

O catálogo do pySUS para SIH/RD/SP não é contíguo: no momento desta
implementação, 152 arquivos existiam para SP/RD entre 1992-01 e 2026-02, de
até ~408 meses possíveis no período — várias lacunas (ex.: nada entre
2022-08 e 2023-04). **A causa (lacuna real de publicação do DATASUS vs.
espelho do pySUS ainda incompleto) não foi determinada** — não deve ser
lida como "o DATASUS não publicou esses meses". Confirmado ao expandir para
o ano de 2024 inteiro na Fase 5.1 (§11): de 12 competências solicitadas,
apenas 4 (2024-02, 06, 08, 12) estavam no catálogo — as demais foram
reportadas como ausentes, nunca preenchidas com dado inventado ou copiado
de outro mês.

## 9. Por que o Radar de Risco continua sem nenhuma competência REAL

`PRESSAO_HOSPITALAR_ESTIMADA` precisa de dois insumos REAL na **mesma
competência**: `pacientesDia` (agora disponível, via SIH, para 4
competências de 2024 — ver §11) e `leitosSus` (via CNES, mas capturado como
um **snapshot único** sem histórico por competência — anexado à competência
do momento da ingestão do CNES, hoje 2026-08). Verificado diretamente no
banco: `FatoCapacidadeLeitos` REAL só existe para a competência do snapshot
CNES; 0 linhas para qualquer competência de 2024. Combinar o snapshot de
leitos (de outra competência) com internações de 2024 seria uma premissa
temporal não documentada, presa a este projeto - não foi feita. Por isso
`PRESSAO_HOSPITALAR_ESTIMADA` continua indisponível para todo município REAL
nesta fase, mesmo com SIH cobrindo agora 4 competências e CNES ingerido.
Isso deixa de ser verdade quando (a) o SIH for ingerido para a mesma
competência do snapshot de leitos, ou (b) o CNES ganhar histórico de leitos
por competência — nenhuma das duas fontes hoje permite isso (ver §11.2).

## 10. O que NÃO foi resolvido por esta implementação

- Fonte do indicador de VULNERABILIDADE.
- Janela móvel/sazonalidade de TENDÊNCIA; fórmula de SEVERIDADE.
- Segundo limiar de confiabilidade (ALTA/MÉDIA/BAIXA).
- População REAL (IBGE Censo 2022) — sem ela, taxa de internação por 10k
  habitantes também não pode ser REAL, mesmo com `FatoInternacaoResidencia`
  REAL agora existindo.
- Cobertura completa do SIH (a Fase 5.1 ampliou de 1 para 4 competências REAL
  de 2024, tudo que o catálogo espelhado disponibiliza para o ano - ver §11;
  cobrir outros anos exige só rodar `etl/ingest_sih.py` com mais
  competências em `COMPETENCIAS_POC`, cada uma sujeita à mesma checagem de
  disponibilidade no catálogo, ver §8).
- Sobreposição temporal SIH × CNES (nenhuma competência de 2024 tem CNES
  REAL — ver matriz em §11.2). Sem histórico de leitos por competência na
  fonte CNES/DEMAS, isso não é resolvível só ingerindo mais meses de SIH.

Nenhuma dessas lacunas foi resolvida por conta própria nesta implementação
— continuam pendências explícitas.

## 11. Fase 5.1 — expansão para o ano de 2024

Repetição do mesmo pipeline (`etl/ingest_sih.py`, mesmo container Linux,
mesmas regras de transformação/supressão/proveniência das seções 1-7) para
as 12 competências de 2024, em vez das 3 do POC original. Nenhuma regra
metodológica mudou - só o intervalo de competências solicitadas
(`COMPETENCIAS_POC`, agora `[(2024, 1), ..., (2024, 12)]`).

### 11.1 Cobertura por competência

| Competência | No catálogo pySUS | Registros brutos | Oncológicos (C00-C97) | Válidos p/ agregação | Células `FatoInternacaoResidencia` | Células `FatoInternacaoLocal` | Status da execução |
|---|---|---|---|---|---|---|---|
| 2024-01 | ❌ ausente | — | — | — | — | — | não processada |
| 2024-02 | ✅ | 221.117 | 16.020 | 16.016 | 3.467 | 1.177 | PARCIAL¹ |
| 2024-03 | ❌ ausente | — | — | — | — | — | não processada |
| 2024-04 | ❌ ausente | — | — | — | — | — | não processada |
| 2024-05 | ❌ ausente | — | — | — | — | — | não processada |
| 2024-06 | ✅ | 240.552 | 16.279 | 16.277 | 3.601 | 1.173 | PARCIAL¹ |
| 2024-07 | ❌ ausente | — | — | — | — | — | não processada |
| 2024-08 | ✅ | 246.085 | 16.914 | 16.914 | 3.703 | 1.211 | SUCESSO |
| 2024-09 | ❌ ausente | — | — | — | — | — | não processada |
| 2024-10 | ❌ ausente | — | — | — | — | — | não processada |
| 2024-11 | ❌ ausente | — | — | — | — | — | não processada |
| 2024-12 | ✅ | 225.756 | 15.433 | 15.427 | 3.461 | 1.182 | PARCIAL¹ |

¹ `PARCIAL` é o status esperado quando há qualquer rejeição pré-agregação
(idade não classificável, célula com valor inválido) — não indica erro do
pipeline; é a mesma semântica já usada desde a Fase 5 original. As 8
competências ausentes não geraram `IngestaoExecucao` nenhuma (nunca chegam
a existir como tentativa - o script pula antes de qualquer escrita, ver
`etl/ingest_sih.py`).

Números confirmados diretamente no banco após a execução (não reproduzidos
de memória): `SELECT origem, "competenciaId", count(*), sum(internacoes)
FROM gold."FatoInternacaoResidencia"/"FatoInternacaoLocal" GROUP BY ...`.

### 11.2 Matriz de sobreposição SIH × CNES

| Competência | SIH REAL | CNES REAL | Sobreposição | Pressão Hospitalar REAL possível |
|---|---|---|---|---|
| 2024-01 | ❌ | ❌ | ❌ | ❌ |
| 2024-02 | ✅ | ❌ | ❌ | ❌ |
| 2024-03 | ❌ | ❌ | ❌ | ❌ |
| 2024-04 | ❌ | ❌ | ❌ | ❌ |
| 2024-05 | ❌ | ❌ | ❌ | ❌ |
| 2024-06 | ✅ | ❌ | ❌ | ❌ |
| 2024-07 | ❌ | ❌ | ❌ | ❌ |
| 2024-08 | ✅ | ❌ | ❌ | ❌ |
| 2024-09 | ❌ | ❌ | ❌ | ❌ |
| 2024-10 | ❌ | ❌ | ❌ | ❌ |
| 2024-11 | ❌ | ❌ | ❌ | ❌ |
| 2024-12 | ✅ | ❌ | ❌ | ❌ |

**Nenhuma competência de 2024 tem CNES REAL**, por construção da fonte, não
por lacuna de ingestão: a API CNES/DEMAS usada por `etl/ingest_cnes.py` não
expõe histórico por competência — devolve só o estado atual da capacidade de
leitos, sempre gravado na competência do mês em que o ETL roda (hoje
2026-08, `obter_ou_criar_competencia_atual()` em `etl/ingest_cnes.py`).
Reingerir CNES não muda isso: rodar o script de novo hoje ainda gravaria em
2026-08, não em nenhum mês de 2024. Por isso a Pressão Hospitalar Estimada
REAL segue indisponível para as 4 competências SIH ingeridas nesta fase -
**não é um workaround adiado, é uma limitação estrutural da fonte CNES/DEMAS
disponível**, que só deixa de valer se (a) o Ministério da Saúde publicar
histórico de leitos por competência nessa API, ou (b) uma fonte REAL
alternativa de capacidade hospitalar histórica for adotada. Nenhuma
aproximação temporal (usar o snapshot de 2026-08 como proxy de 2024) foi
feita — produziria um número REAL com premissa não validada, o que este
projeto não faz (CLAUDE.md, "nunca invente dados").

**Atualização (Fase 5.3): a opção (b) acima foi encontrada e implementada.**
Ver seção 12 — a alternativa REAL de capacidade histórica é o próprio CNES,
grupo LT, acessado via pySUS (não a API DEMAS), disponível desde Out/2005.
As seções 9-11.2 acima permanecem como registro histórico de por que a
Fase 5/5.1 não conseguiram resolver isso com a fonte que tinham; não
apagadas para preservar o raciocínio que levou à Fase 5.3.

## 12. Fase 5.3 — CNES histórico (grupo LT, via pySUS) resolve a sobreposição

`etl/ingest_cnes_historico.py` (container Linux dedicado,
`etl/docker/Dockerfile.cnes_historico` - mesma solução de ambiente do SIH)
lê o grupo **LT** do CNES no mesmo catálogo DuckLake/pySUS já usado para o
SIH - histórico real de leitos por competência, confirmado disponível para
SP desde Out/2005. Detalhes completos, decisões de mapeamento de
`TP_LEITO` e resultado da execução: `docs/fase-5.3-relatorio.md`.

### 12.1 Matriz de sobreposição SIH × CNES, atualizada

| Competência | SIH REAL | CNES REAL (LT) | Sobreposição | Pressão Hospitalar REAL possível |
|---|---|---|---|---|
| 2024-02 | ✅ | ✅ | ✅ | ✅ (4 municípios) |
| 2024-06 | ✅ | ✅ | ✅ | ✅ (6 municípios) |
| 2024-08 | ✅ | ✅ | ✅ | ✅ (5 municípios) |
| 2024-12 | ✅ | ✅ | ✅ | ✅ (4 municípios) |

Cobertura por município ainda modesta (a mesma supressão `n<5` que já
limitava outros indicadores REAL agora também filtra Pressão Hospitalar,
célula a célula, por competência) — mas a limitação **estrutural** (fontes
que nunca compartilhavam competência) está resolvida. `calculate-risk-real.ts`
materializa `RiskComponenteValor`/`RiskScore` REAL pela primeira vez desde
que o produto existe — o Radar deixou de ser exclusivamente DEMO.

### 12.2 O que continua pendente

- UTI não é gravado a partir do CNES histórico (decisão conservadora,
  `CODLEITO` reclassificado sem tabela estável confirmada - ver
  `docs/fase-5.3-relatorio.md` §2). Não afeta a fórmula (soma todos os
  tipos).
- VULNERABILIDADE: sem fonte REAL configurada nesta fase.
- TENDÊNCIA REAL (variação com sazonalidade) e SEVERIDADE REAL: sem
  mudança - lacuna metodológica, não de dado.
- Expandir a cobertura (mais anos de SIH + CNES histórico, mesma mecânica)
  é o próximo passo mecânico mais simples para aumentar o número de
  municípios com índice REAL.
