# Fase 5.3 — Relatório de Implementação

## 1. Objetivo

Resolver a limitação estrutural documentada desde a Fase 5/5.1
(`docs/sih-methodology.md` §9, §11.2): Pressão Hospitalar Estimada REAL
precisa de SIH e CNES na mesma competência, e a fonte de CNES usada até
aqui (API DEMAS, `etl/ingest_cnes.py`) só dá um snapshot atual, nunca uma
competência passada. Sem isso, **o Radar de Risco (RiskScore) nunca havia
produzido uma linha REAL** — sempre 100% DEMO, mesmo com SIH e geografia
REAL já existindo desde a Fase 5.

## 2. Investigação (antes de escrever qualquer linha de ingestão)

Confirmado ao vivo, dentro do container Linux já usado para o SIH
(`etl/docker/Dockerfile.sih`, que já tem pySUS instalado):

- O catálogo DuckLake do pySUS (o mesmo espelho já usado por
  `etl/healthmap_etl/sources/sih.py`) tem um dataset `"cnes"` com o grupo
  **"LT" (Leitos)**, histórico desde Out/2005, caminho
  `public/data/ftp/cnes/LT/{ANO}/{MES}/{UF}/...parquet`.
- Arquivo `LT/SP` **existe para as 4 competências que já tinham SIH REAL**
  (2024-02, 06, 08, 12) — a sobreposição que faltava.
- Colunas do parquet: `CNES`, `CODUFMUN` (IBGE6), `TP_LEITO`, `CODLEITO`,
  `QT_EXIST`, `QT_SUS`, `COMPETEN`. `QT_SUS`/`QT_EXIST` vêm como **string**
  (formato fixo do DBC histórico) — precisam de conversão numérica explícita
  antes de agregar (`pd.to_numeric`), mesmo padrão já usado em
  `ingest_sih.py`.
- `TP_LEITO` (1-7): dicionário oficial confirmado contra a própria
  ferramenta de indicadores do CNES
  (`cnes2.datasus.gov.br/Mod_Ind_Tipo_Leito.asp`) — 1=Cirúrgico, 2=Clínico,
  3=Complementar (inclui UTI, mas não só UTI), 4=Obstétrico, 5=Pediátrico,
  6=Outras Especialidades, 7=Hospital Dia. O subcódigo `CODLEITO` permitiria
  identificar UTI dentro de "Complementar", mas foi reclassificado pela
  Portaria SAES/MS mais de uma vez (2019, 2023) e não foi possível confirmar
  uma tabela única e estável nesta sessão — **decisão conservadora**: 1→CIRURGICO,
  2→CLINICO, 3-7→OUTRO, nunca UTI a partir desta fonte (mesma lógica que
  `cnes.py`/DEMAS já usa para não ratear CLINICO/CIRURGICO sem base
  documentada). Isso não afeta a fórmula de Pressão Hospitalar, que soma
  `leitosSus` de TODOS os tipos por município+competência.
- Sem duplicidade de chave natural (`CNES`+`CODLEITO`) no arquivo testado.

## 3. `etl/ingest_cnes_historico.py`

Mesmo padrão arquitetural de `ingest_sih.py`: só roda dentro de um
container Linux dedicado (`etl/docker/Dockerfile.cnes_historico`,
`requirements-cnes-historico.txt` idêntico ao do SIH), nunca no Python
principal do host. `COMPETENCIAS_ALVO` = as mesmas 4 competências já
cobertas por SIH REAL.

Grava `gold.FatoCapacidadeLeitos` (mesma tabela/chave natural já usada por
`ingest_cnes.py`) — `leitosSus` = soma de `QT_SUS`, `leitosTotais` = soma de
`QT_EXIST`, agregado por município × competência × tipoLeito mapeado.

### 3.1 Resultado (execução real)

| Competência | Linhas brutas | Linhas agregadas (município×tipo) | Soma leitosSus |
|---|---|---|---|
| 2024-02 | 8.418 | 980 | 63.548 |
| 2024-06 | 8.416 | 980 | 64.064 |
| 2024-08 | 8.445 | 979 | 64.144 |
| 2024-12 | 8.363 | 978 | 64.217 |

Idempotência confirmada por execução dupla completa: segunda rodada grava
exatamente as mesmas 3.917 linhas totais, mesmas somas por competência.
Zero rejeições em todas as competências.

## 4. `calculate-risk-real.ts` — o Radar deixa de ser só DEMO

Mesma fronteira arquitetural de `calculate-risk-demo.ts` (Fase 2): lê `gold`
via `packages/db`, calcula via `packages/risk` (as **mesmas** funções -
`calcularPressaoHospitalarEstimada`, `calcularTendencia`,
`calcularSeveridade`, `calcularVulnerabilidade`, `normalizarComponentesNaCoorte`,
`calcularScore`, `classificarPorQuintil` - nenhuma segunda implementação,
CLAUDE.md #3), persiste via `packages/db`.

Extensões aditivas em `packages/db/src/repositories/risk.ts`:
`getMunicipios`/`getCompetencias` já tinham ganho `apenasReal` na Fase 5.2 -
reaproveitadas sem mudança. Nenhuma função nova de agregação foi necessária:
`getAgregadoInternacaoLocal`/`getAgregadoCapacidadeLeitos` (existentes desde
a Fase 2) já são agnósticas de origem por construção (município DEMO e REAL
nunca compartilham id).

**RiskConfig REAL nova** (`autor: 'fase5.3-real'`), criada pelo próprio
script se não existir — mesmo padrão de pesos iguais (0.25) e `oficial:
false` das duas RiskConfig DEMO da Fase 2, pela mesma razão (nenhum peso
oficial documentado). `VULNERABILIDADE` fica estruturalmente presente mas
sem `indicadorDefinicaoId` configurado — nenhuma fonte REAL de
vulnerabilidade foi integrada nesta fase (ver item 2 pendente,
`docs/known-limitations.md`).

### 4.1 Resultado (execução real)

| Competência | Municípios com índice disponível |
|---|---|
| 2024-02 | 4 |
| 2024-06 | 6 |
| 2024-08 | 5 |
| 2024-12 | 4 |

19 `RiskScore` REAL no total, 10.320 `RiskComponenteValor` REAL (todos os 4
componentes × todos os 645 municípios × 4 competências, a maioria
`disponivel=false` documentado). Cobertura modesta pela mesma razão
estrutural da Fase 5.2 (supressão `n<5` — aqui por competência/mês, não por
ano inteiro, por isso a cobertura é bem maior que o único município da Fase
5.2). Municípios com índice: Barretos (sede do Hospital de Câncer de
Barretos - referência oncológica nacional, plausivelmente `CRITICO` em
todas as 4 competências), Ribeirão Preto, Campinas, São Paulo, São José dos
Campos, Jaú, Santo André — perfil geográfico plausível (polos hospitalares
conhecidos do estado), não validado contra estatística externa.

Verificado ao vivo no navegador: `/municipios/78?competenciaId=11` (Barretos,
fev/2024) mostra índice **1.00, Crítico, Alta confiabilidade, REAL**,
componente Pressão Hospitalar Estimada com valor `0,3114` (ESTIMATIVA, REAL),
Tendência/Severidade/Vulnerabilidade corretamente "Indisponível" com o
motivo metodológico exato. **Nenhuma mudança de API, contrato ou frontend
foi necessária** — a cadeia já era genérica o suficiente.

## 5. Testes

- `packages/db/src/__tests__/fase5.3.test.ts` (15 testes novos): CNES
  histórico (cobertura, proveniência, sem UTI, idempotência), RiskConfig
  REAL (existe, não oficial, 4 componentes, VULNERABILIDADE sem fonte),
  Radar REAL (RiskScore > 0, aponta para município REAL, Pressão disponível
  para ≥1 município, Tendência/Severidade/Vulnerabilidade sempre
  indisponíveis, classificação válida, idempotência, DEMO×REAL nunca
  misturados na mesma competência+config).
- **Regressão corrigida em `fase5.test.ts`**: o teste "PRESSAO_HOSPITALAR_ESTIMADA
  continua indisponível para REAL: nenhuma competência tem SIH e CNES REAL
  simultaneamente" — literalmente a limitação que esta fase resolve —
  invertido para provar o oposto (a intersecção agora existe).
- **Regressão corrigida em `fase2.test.ts`**: dois testes "origem é sempre
  DEMO" (`RiskComponenteValor`/`RiskScore`), escritos na Fase 2 quando só
  DEMO existia na tabela. Reescritos para a invariante que continua
  verdadeira: nenhum município DEMO específico tem uma linha não-DEMO
  (nunca mistura por município), em vez de "a tabela inteira só tem DEMO".
- Total `packages/db`: **93/93**. `packages/risk`: 43/43 (inalterado -
  nenhuma fórmula mudou). `apps/api`: 34/34 (inalterado - nenhuma mudança
  de API foi necessária).
- `npm run typecheck`, `npm run lint`: limpos.

## 6. Pendências / limitações

- **Cobertura ainda modesta** (4-6 municípios por competência, de ~350-600
  com algum dado) — mesma razão estrutural da supressão `n<5`, agora só por
  mês em vez de por ano inteiro (bem melhor que a Fase 5.2, mas ainda
  distante de cobrir os 645 municípios).
- **UTI nunca é gravado a partir desta fonte** — decisão conservadora
  documentada na seção 2 (`CODLEITO` reclassificado, sem tabela estável
  confirmada). Não afeta a fórmula de Pressão Hospitalar (soma todos os
  tipos), só o detalhamento por tipo de leito.
- **VULNERABILIDADE REAL continua indisponível** — sem fonte configurada
  nesta fase (ver próximo item do roadmap).
- **Totais pós-agregação não foram cross-validados** contra uma estatística
  publicada independente (mesma ressalva já registrada para
  `ingest_cnes.py`/DEMAS na Fase 5).

## 7. Próximo passo recomendado

Vulnerabilidade social (IPVS/SEADE) é o próximo componente natural — mas a
investigação encontrou o dado primário em grão de setor censitário (não
município) com licença não localizada na página do recurso específico,
exigindo decisão explícita antes de ingerir (ver
`docs/known-limitations.md` §10).
