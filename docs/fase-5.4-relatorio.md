# Fase 5.4 — Relatório de Implementação

## 1. Objetivo

Ativar o componente VULNERABILIDADE do Radar — sem fonte definida desde a
Fase 0 (`docs/risk-methodology.md` #2.4) — usando o Índice Paulista de
Vulnerabilidade Social (IPVS), Fundação SEADE, a única fonte identificada
para esse propósito.

## 2. Investigação e a decisão que precisou de aprovação explícita

O único recurso IPVS machine-readable encontrado (`repositorio.seade.gov.br`)
está em **grão de setor censitário**, não município (~103 mil setores para
645 municípios de SP), e sua página de recurso não declara licença
("Nenhuma Licença Fornecida") — diferente de toda outra fonte REAL deste
projeto. Agregar setor→município exige um método que a SEADE não publica
pronto — decisão de metodologia, não de código. Apresentado ao usuário
antes de implementar; aprovado explicitamente: usar o arquivo por setor,
agregar por município via **média ponderada por população**, gravando
natureza `ESTIMATIVA` (nunca `OBSERVADO`) e documentando a licença não
declarada.

## 3. Fontes e arquivos

Dois arquivos da Fundação SEADE, baixados para `HEALTHMAP_BRONZE_DIR`
(nova variável, `.env`/`.env.example`, default `./data/bronze` — reservada
desde a Fase 0 e nunca usada até agora; `data/bronze/` já estava no
`.gitignore`):

- **IPVS 2022 por setor censitário** (shapefile, `.dbf` tem a tabela de
  atributos que interessa: `CD_SETOR`, `CD_MUN`, `C_IPVS` 1-7,
  `N_IPVS` rótulo) — 103.319 setores.
- **População e Domicílio por Setor Censitário, Censo 2022** (CSV,
  `cd_setor` + `v0001` = total de pessoas) — 102.418 setores.

**Achado de cruzamento** (confirmado, não presumido): o código de setor do
arquivo de população tem um sufixo `'P'` que o arquivo do IPVS não tem;
removendo o sufixo, a interseção dos dois arquivos é de 92.722 setores
(~90% de cada lado) — o resto (setores sem par em algum dos dois arquivos)
é excluído do cálculo do seu município, nunca zerado ou inventado.

## 4. `etl/healthmap_etl/sources/seade_ipvs.py` + `etl/ingest_vulnerabilidade.py`

`calcular_ipvs_ponderado_por_municipio` (função pura, testada sem I/O):
para cada município, média de `C_IPVS` dos setores classificados
("Não classificado" na fonte = excluído), ponderada pela população do
setor (só entram setores com par nos dois arquivos). Devolve também
`setores_usados`/`setores_no_municipio`, para medir cobertura por
município.

`ingest_vulnerabilidade.py` grava:

- `meta.FonteDados` (`SEADE_IPVS`) — licença registrada como "não declarada
  na página do recurso nesta sessão", nunca inventada;
- `meta.IndicadorDefinicao` nova (`IPVS_MEDIA_PONDERADA_SETOR`) — criada
  pelo próprio ETL (nova função `lineage.upsert_indicador_definicao`, até
  aqui só `seed-demo.ts`/TypeScript criava definições) — `naturezaPadrao =
  ESTIMATIVA`, `notaMetodologica` explicando a aproximação;
- `gold.IndicadorMunicipal` REAL — `valor` = média ponderada, `denominador`
  = população efetivamente usada (auditoria de quanto da população do
  município o cálculo cobre).

### 4.1 Resultado (execução real)

- **645 de 645 municípios REAL** receberam um valor (todo município tem
  pelo menos 1 setor classificado).
- **Cobertura de setores no cálculo: 85.608/103.319 (82,9%)** — acima do
  limiar de alerta (80%) definido no quality check
  `ipvs_taxa_cobertura_setores` (severidade `ALERTA`, não bloqueante).
- Sanidade conferida nos extremos: **São Caetano do Sul** (nacionalmente
  conhecido pelo maior IDH municipal do Brasil) ficou com o **menor**
  valor (1,72 — mais próximo de "muito baixa vulnerabilidade"); municípios
  pequenos do interior (Júlio Mesquita, Itapirapuã Paulista, Barbosa...)
  ficaram no topo (~4,7-4,8) — direção e magnitude plausíveis, não
  validados contra publicação oficial da SEADE em nível município (que não
  existe).

## 5. Ativação do componente VULNERABILIDADE

Nova `RiskConfig` REAL (`autor: 'fase5.4-real'`, substitui `fase5.3-real`
sem apagá-la — `RiskConfig` nunca é alterada após uso). O componente
`VULNERABILIDADE` só recebe `indicadorDefinicaoId` se
`IPVS_MEDIA_PONDERADA_SETOR` já existir no banco no momento da criação
(`calculate-risk-real.ts` verifica antes) — torna o script robusto à ordem
de execução dos `ingest_*.py`.

`calcularVulnerabilidade` (`packages/risk`, **sem nenhuma mudança de
código** — já aceitava `valorIndicador` resolvido externamente desde a
Fase 2) passou a receber o valor real do IPVS por município. `volume`
passado é a população usada no cálculo (não uma contagem de
internações, semanticamente diferente dos outros componentes, mas o
mesmo mecanismo genérico de confiabilidade-por-limiar já existente —
population na casa dos milhares/milhões supera trivialmente
`limiarVolumeMinimo`, então VULNERABILIDADE aparece consistentemente com
confiabilidade `ALTA` quando disponível).

Nova função `getIndicadorMunicipalPorDefinicao` (`packages/db`) — genérica,
reutilizável por qualquer componente futuro que precise resolver um
`IndicadorMunicipal` por `indicadorDefinicaoId`+`ano`.

## 6. Resultado do Radar REAL com VULNERABILIDADE ativa

Execução real de `calculate-risk-real.ts` (config `fase5.4-real`):
**VULNERABILIDADE disponível para os 645 municípios × 4 competências**
(100% - o IPVS cobre todo município). Como o Radar produz `RiskScore` para
qualquer município com **pelo menos 1** componente disponível (pesos
renormalizados sobre os componentes disponíveis), isso multiplicou a
cobertura do Radar REAL:

| Config | RiskScore REAL |
|---|---|
| `fase5.3-real` (só Pressão Hospitalar, quando disponível) | 19 |
| `fase5.4-real` (Pressão + Vulnerabilidade) | **2.580** |

Distribuição por classificação (competência 2024-02): ~130 municípios em
cada uma das 5 faixas (CRITICO/ALTO/MEDIO/BAIXO/MUITO_BAIXO) — quintil
equilibrado sobre uma coorte de 645, como esperado. Barretos continua
`CRITICO` (Pressão Hospitalar dominante); municípios pequenos no topo do
IPVS (Júlio Mesquita, Itapirapuã Paulista...) também aparecem entre os mais
críticos, puxados por VULNERABILIDADE.

## 7. Testes

- `etl/tests/test_vulnerabilidade.py` (8 testes novos, função pura de
  agregação): média ponderada simples, peso maior puxa a média, setor não
  classificado excluído (nunca zerado), setor sem par em população
  excluído, município sem nenhum setor classificável não aparece,
  municípios distintos não se misturam, dicionários vazios, população zero
  tratada como ausente. Total `etl/tests`: **89/89**.
- `packages/db/src/__tests__/fase5.4.test.ts` (11 testes novos): IPVS
  (definição ESTIMATIVA, cobertura de 645 municípios, intervalo válido 1-7,
  denominador preenchido, nunca aponta para município DEMO, repositório
  bate com o banco), RiskConfig `fase5.4-real` (aponta para o IPVS;
  `fase5.3-real` permanece intocada), Radar REAL (VULNERABILIDADE 100%
  disponível, cobertura muito maior que a config anterior, distribuição de
  quintil equilibrada).
- **Regressão corrigida em `fase5.3.test.ts`**: o teste que afirmava
  VULNERABILIDADE REAL sempre indisponível — verdade até esta fase —
  invertido para provar o oposto.
- **Achado de infraestrutura de teste, corrigido**: a suíte completa de
  `packages/db` ficou intermitente ao crescer (Vitest roda arquivos de
  teste em paralelo por padrão; vários arquivos escrevem nas mesmas
  tabelas `gold` de um Postgres compartilhado, e `fase2.test.ts` sobe um
  processo filho completo no meio do teste) — confirmado isolando
  `fase2.test.ts` (16/16 sozinho, falha só junto de outros arquivos). Não
  é um bug de produto; corrigido com `packages/db/vitest.config.ts`
  (`fileParallelism: false`) — suíte inteira determinística depois disso.
- Total `packages/db`: **104/104** (todos os arquivos, execução
  sequencial). `packages/risk`: 43/43 (inalterado). `apps/api`: 34/34
  (inalterado - nenhuma mudança de API foi necessária).
- `npm run typecheck`, `npm run lint`: limpos.

## 8. Pendências / limitações

- **Aproximação, não produto oficial da SEADE** — reiterado na
  `IndicadorDefinicao.notaMetodologica`, no `FonteDados.licenca` e aqui.
  Deve ser tratado como plausível, não como número auditado externamente.
- **Licença não confirmada** — dado tratado como público (mesma família do
  governo do estado de SP), mas sem declaração explícita de licença
  encontrada na página do recurso específico usado.
- **Confiabilidade de VULNERABILIDADE usa população como "volume"** — uma
  reutilização do mecanismo genérico já existente, não uma calibração
  nova; quase sempre resulta em `ALTA` (ver seção 5), o que é honesto
  (cobertura populacional real é alta) mas não discrimina tão bem quanto o
  volume de internações discrimina os outros componentes.
- **IPVS é decenal** (próxima atualização só no Censo seguinte) — não
  varia por competência, diferente de Pressão Hospitalar.
- Como bônus não implementado: o mesmo pacote de dados do Censo 2022 da
  SEADE também publica "População por sexo e faixa etária" **em nível de
  município** — se ingerida no futuro, alimentaria `gold.Populacao` (grão
  censitário, ver Fase 5.2) com dado 100% real, sem a aproximação por
  setor censitário que este item exigiu.
