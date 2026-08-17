# Metodologia da ingestão SIH/SUS

> Estado: implementado (segunda rodada da Fase 5) para um período de prova de
> conceito (POC) controlado. Ver [`docs/fase-5-relatorio.md`](fase-5-relatorio.md)
> para os números exatos ingeridos e [`docs/known-limitations.md`](known-limitations.md)
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
lida como "o DATASUS não publicou esses meses". O POC solicitou
2024-01/02/03; só 2024-02 estava disponível no catálogo no momento da
ingestão — 2024-01 e 2024-03 foram reportados como ausentes, não
preenchidos com dado inventado ou copiado de outro mês.

## 9. Por que o Radar de Risco continua sem nenhuma competência REAL

`PRESSAO_HOSPITALAR_ESTIMADA` precisa de dois insumos REAL na **mesma
competência**: `pacientesDia` (agora disponível, via SIH, para 2024-02) e
`leitosSus` (via CNES, mas capturado como um **snapshot único** sem
histórico por competência — anexado à competência do momento da ingestão
do CNES, não 2024-02). Verificado diretamente no banco: `FatoCapacidadeLeitos`
REAL só existe para a competência do snapshot CNES; 0 linhas para 2024-02.
Combinar o snapshot de leitos (de outra competência) com internações de
2024-02 seria uma premissa temporal não documentada, presa a este projeto -
não foi feita. Por isso `PRESSAO_HOSPITALAR_ESTIMADA` continua indisponível
para todo município REAL nesta fase, mesmo com SIH e CNES ambos parcialmente
ingeridos. Isso deixa de ser verdade quando (a) o SIH for ingerido para a
mesma competência do snapshot de leitos, ou (b) o CNES ganhar histórico de
leitos por competência.

## 10. O que NÃO foi resolvido por esta implementação

- Fonte do indicador de VULNERABILIDADE.
- Janela móvel/sazonalidade de TENDÊNCIA; fórmula de SEVERIDADE.
- Segundo limiar de confiabilidade (ALTA/MÉDIA/BAIXA).
- População REAL (IBGE Censo 2022) — sem ela, taxa de internação por 10k
  habitantes também não pode ser REAL, mesmo com `FatoInternacaoResidencia`
  REAL agora existindo.
- Cobertura completa do SIH (o POC cobre 1 competência; expandir exige só
  rodar `etl/ingest_sih.py` com mais competências da lista
  `COMPETENCIAS_POC`, mas cada uma precisa existir no catálogo espelhado -
  ver seção 8).

Nenhuma dessas lacunas foi resolvida por conta própria nesta implementação
— continuam pendências explícitas.
