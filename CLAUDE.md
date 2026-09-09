# CLAUDE.md - HealthMap Regional

Documentacao operacional do projeto. Leia este arquivo antes de qualquer
alteracao no repositorio.

---

## Contexto

O HealthMap Regional e uma plataforma de inteligencia analitica para saude
publica. Integra dados publicos do **SIH/SUS**, **CNES** e **IBGE** para
monitorar internacoes hospitalares por municipio, com foco inicial em oncologia
(neoplasias malignas, CID-10 C00-C97) no estado de Sao Paulo, com ate 5 anos de
historico.

O produto **nao** e sistema clinico nem transacional hospitalar. E um produto
analitico de apoio a decisao de gestao, alimentado por dados publicos agregados.

**Estado atual: Fase 5.10 (higienizacao REAL/DEMO + readequacao SIH)
concluida.** As analises do produto usam REAL; a base DEMO continua integra
no banco e nos testes, mas nao alimenta mais as paginas analiticas (Fase
5.9). Na Fase 5.10 o isolamento REAL/DEMO das RiskConfigs foi corrigido na
origem e `TAXA_INTERNACAO_10K_HAB` passou de 1 para 639 dos 645 municipios,
via `gold.FatoInternacaoResidenciaAnual` (agregado do dado bruto, supressao
n<5 decidida uma vez no ano - mesma solucao da Fase 5.6). RiskScore,
RiskConfig, pesos e metodologia inalterados; suite 100% verde. Ver
`docs/fase-5.9-relatorio.md` e `docs/fase-5.10-relatorio.md`. Schema, migrations, base DEMO, motor de risco
(`packages/risk`), API REST somente-leitura (`apps/api`) e um dashboard
navegavel (`apps/web`) existem e estao validados - publico, sem
autenticacao. O frontend consome a API (Visao Geral com mapa real de SP em
SVG proprio, Radar de Risco, **Radar Municipal** - mapa interativo por
indicador (internacoes, taxa de internacao, obitos oncologicos, mortalidade
oncologica, RiskScore, vulnerabilidade), com ranking e painel de
detalhamento -, Municipios, detalhe de municipio, Metodologia, Sobre),
identidade visual propria (tema claro, azul institucional, escala de risco
nunca so cor). A navegacao e a Visao Geral seguem tres niveis explicitos
(Situacao -> Analise -> Investigacao, Fase 5.8).

**Fluxo assistencial REAL entrou na Fase 5.8** (`gold.FatoFluxoInternacao`,
SIH/SUS): par ordenado municipio de residencia -> municipio de internacao,
grao ANUAL, supressao n<5 decidida uma vez sobre o total do par. 3.555 pares
em 2024 (1.838 visiveis, 183.193 internacoes), 645 origens e 292 destinos -
revela os polos de tratamento (Sao Paulo, Jau, Barretos...). E a UNICA tabela
que carrega os dois eixos na mesma linha: o invariante #4 proibe compor um
NUMERO misturando residencia e internacao, nao registrar o par ordenado, que
e irrecuperavel a partir das agregacoes marginais existentes (ver
`docs/fase-5.8-relatorio.md` #2 e #4).

**Dados REAL** (via `etl/`, pacote Python, escreve direto no Postgres,
convivendo sem mistura com os 15 municipios DEMO - prefixo `36xxxxx`):
geografia completa (645 municipios + 17 DRS, IBGE/SES-SP), capacidade de
leitos (snapshot via API DEMAS + **historico por competencia via CNES
grupo LT/pySUS**, Fase 5.3), internacoes oncologicas via SIH/SUS (pySUS,
container Linux dedicado `etl/docker/Dockerfile.sih` - contorna
pyreaddbc/Windows - **as 12 competencias de 2024** (`COMPETENCIAS_POC`; o
catalogo espelhado pelo pySUS servia so 02/06/08/12 ate a Fase 5.6, quando
passou a servir o ano completo - ver `docs/fase-5.6-relatorio.md` #9), populacao estimada anual (IBGE tabela
6579, Fase 5.2) e vulnerabilidade social (IPVS/SEADE, Fase 5.4 - unica
fonte em grao de setor censitario encontrada, sem licenca declarada;
agregada por municipio via media ponderada por populacao, aprovada
explicitamente pelo usuario, natureza `ESTIMATIVA`).

**O Radar de Risco (RiskComponenteValor/RiskScore) ja produz REAL**, nao
so DEMO, em dois graos: **municipal** (`PRESSAO_HOSPITALAR_ESTIMADA` +
`VULNERABILIDADE`, config `fase5.4-real`, **7.740 RiskScore, 645 municipios
x 12 competencias**) e **regional** (Fase 5.5 - `RiskScoreRegional`, **204
scores, 17 DRS x 12 competencias**, **100% de cobertura** - supressao n<5
decidida de forma independente no grao regional, direto do dado bruto do
SIH/CNES, nunca somando fatos municipais ja suprimidos).
`TENDENCIA`/`SEVERIDADE` ficam estruturalmente prontas mas sempre
indisponiveis (lacuna metodologica, nao inventada).

**Atencao a distincao de cobertura**: o SIH cobre as 12 competencias de
2024, mas o **CNES historico** (`etl/ingest_cnes_historico.py`) so ingeriu
4 - por isso `PRESSAO_HOSPITALAR_ESTIMADA` existe em apenas 4 das 12
competencias. Todos os 645 municipios recebem indice em todas as 12 graças
a renormalizacao de pesos (o indice e composto com os componentes
disponiveis). A limitacao de "4 competencias" e do CNES/Pressao Hospitalar,
**nao** do SIH. Alterar isso muda a cobertura de um componente do Radar e
exige autorizacao explicita.

**Mortalidade oncologica REAL entrou na Fase 5.6** (SIM/DATASUS, grupo DO) -
`TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB`, indicador `OBSERVADO` -
**deliberadamente fora do RiskScore** (decisao metodologica explicita:
mortalidade populacional != letalidade hospitalar). `gold.FatoObitoResidencia`
tem grao **municipio x ano** (nao competencia/faixaEtaria/sexo - pivo de
grao decidido apos o grao fino suprimir quase 100% dos municipios mesmo com
totais anuais robustos, ver `docs/fase-5.6-relatorio.md` #5.1), cobrindo
87,6% dos municipios em 2023 e 89,8% em 2024; o indicador em si so
materializa para 2024 (IBGE nao publica populacao 2023). Reaproveita
`calcularTaxaPor10k` ja existente, nenhuma funcao nova em `packages/risk`,
nenhuma RiskConfig alterada - confirmado por teste automatizado.

Historico de decisoes, bugs corrigidos e numeros exatos de cada fase: ver
os relatorios abaixo.

Ver
[`docs/fase-1-relatorio.md`](docs/fase-1-relatorio.md),
[`docs/fase-2-relatorio.md`](docs/fase-2-relatorio.md),
[`docs/fase-3-relatorio.md`](docs/fase-3-relatorio.md),
[`docs/fase-4-relatorio.md`](docs/fase-4-relatorio.md),
[`docs/fase-5-relatorio.md`](docs/fase-5-relatorio.md),
[`docs/fase-5.1-relatorio.md`](docs/fase-5.1-relatorio.md),
[`docs/fase-5.2-relatorio.md`](docs/fase-5.2-relatorio.md),
[`docs/fase-5.3-relatorio.md`](docs/fase-5.3-relatorio.md),
[`docs/fase-5.4-relatorio.md`](docs/fase-5.4-relatorio.md),
[`docs/fase-5.6-relatorio.md`](docs/fase-5.6-relatorio.md) (Fase 5.5 -
Radar Regional - implementada e testada, relatorio dedicado ainda
pendente de redacao, ver `docs/known-limitations.md`) e
[`docs/fase-5.7-relatorio.md`](docs/fase-5.7-relatorio.md) e
[`docs/fase-5.8-relatorio.md`](docs/fase-5.8-relatorio.md) e
[`docs/fase-5.9-relatorio.md`](docs/fase-5.9-relatorio.md) e
[`docs/fase-5.10-relatorio.md`](docs/fase-5.10-relatorio.md).

## Objetivo

Dados de internacoes ficam dispersos em formatos e sistemas distintos, sem
integracao. Gestores nao tem visao consolidada da pressao hospitalar regional. O
HealthMap consolida essas fontes e produz o **Radar de Risco Regional**, que
aponta municipios que merecem maior atencao.

## Stack

| Camada     | Tecnologias                                                      |
| ---------- | ---------------------------------------------------------------- |
| Frontend   | Next.js (App Router), React, TypeScript, Tailwind, shadcn/ui, Lucide |
| Backend    | Node.js, TypeScript, Express, API REST                           |
| Banco      | PostgreSQL 16 em Docker, Prisma ORM                              |
| Dados      | Python (pandas, numpy) - Fase 5                                  |
| Monorepo   | npm workspaces                                                   |

OCI e arquitetura futura. Nao introduza dependencia Oracle no MVP.

## Arquitetura

```
healthmap-regional/
├── apps/web        interface (nunca calcula indice; consome a API)
├── apps/api        API REST (nunca escreve SQL; usa packages/db)
├── packages/db     fronteira UNICA de acesso a dados (Prisma + repositorios)
├── packages/risk   implementacao UNICA do Radar de Risco
├── packages/contracts  tipos e envelope compartilhados web <-> api
├── etl/            pipelines Python (nunca conhece HTTP)
└── docs/           arquitetura, roadmap, modelo de dados, metodologia, ADRs
```

Fluxo: `Fontes -> Ingestao -> Validacao -> Transformacao -> Armazenamento ->
Camada analitica -> API -> Dashboard`.

### Invariantes (nao violar)

1. Nao existe dado individual de paciente no banco da aplicacao. O grao minimo e
   agregado por municipio.
2. Nenhum numero sai da API sem envelope de proveniencia.
3. O indice de risco tem uma unica implementacao: `packages/risk`.
4. Residencia e internacao nunca se misturam.
5. Nenhum SQL fora de `packages/db`.

Detalhes: [`docs/architecture.md`](docs/architecture.md) e
[`docs/adr/001-architecture.md`](docs/adr/001-architecture.md).

## Dados

Todo numero exibido carrega dois eixos de proveniencia:

| Eixo         | Valores                                | Significado                        |
| ------------ | -------------------------------------- | ---------------------------------- |
| **Origem**   | `REAL`, `DEMO`                         | de onde vieram os insumos          |
| **Natureza** | `OBSERVADO`, `ESTIMATIVA`, `PROJECAO`  | como o numero foi produzido        |

Regras:

- **DEMO** e dado sintetico, sempre identificado. Nunca apresente dado DEMO como
  se fosse oficial.
- **REAL** so se veio de fonte oficial, por pipeline registrado.
- **ESTIMATIVA** e todo valor derivado por calculo com premissas (por exemplo, a
  Pressao Hospitalar Estimada). A interface deve deixar claro que e estimativa.
- **PROJECAO** e valor futuro, produzido por metodo estatistico declarado, com
  incerteza visivel e tratamento visual distinto do dado observado.

Nunca invente dados, APIs, fontes oficiais ou resultados de modelo.

## Saude

O sistema **nao deve**:

- diagnosticar;
- prescrever ou recomendar tratamento;
- avaliar pacientes individualmente;
- expor prontuario ou dado pessoal.

Priorize sempre dados agregados por municipio ou regiao. Nao afirme que o sistema
possui conformidade juridica definitiva: o enquadramento legal ainda nao foi
validado.

## Radar

- Indice **analitico e experimental**. Nao e diagnostico clinico, risco clinico
  individual nem avaliacao de qualidade assistencial.
- Componentes previstos: Pressao Hospitalar Estimada, tendencia, severidade,
  vulnerabilidade.
- **Nunca use "ocupacao hospitalar" como metrica observada.** O SIH/SUS nao
  informa ocupacao. Quando o valor for derivado de pacientes-dia e capacidade de
  leitos, o termo e **Pressao Hospitalar Estimada**, com natureza `ESTIMATIVA`.
- Pesos sao **configuraveis e versionados** em banco (`RiskConfig`), nunca
  embutidos em codigo. Nenhum peso e oficial ate ser calibrado e validado.
- A fonte do componente de vulnerabilidade ainda nao foi definida; o componente e
  pluggavel via `IndicadorDefinicao`.

Metodologia: [`docs/risk-methodology.md`](docs/risk-methodology.md).

## Residencia x internacao

Nunca misture os dois eixos.

| Eixo           | Usar para                                          |
| -------------- | -------------------------------------------------- |
| **Residencia** | incidencia, taxa por 10 mil habitantes, tendencia  |
| **Internacao** | Pressao Hospitalar Estimada, capacidade, severidade |

Sao tabelas de fato separadas, tipos separados e endpoints separados. O eixo
viaja no envelope da API (`eixoTerritorial`).

## Desenvolvimento

Antes de implementar qualquer coisa:

1. analisar o codigo existente;
2. verificar como a mudanca se encaixa na arquitetura;
3. propor as alteracoes;
4. implementar;
5. testar;
6. verificar regressoes;
7. documentar o que mudou.

Regras de conduta:

- nao reescrever codigo funcional sem necessidade;
- nao criar funcionalidades nao solicitadas;
- respeitar o faseamento do [`roadmap`](docs/roadmap.md): nao antecipar entregas
  de fases futuras;
- quando uma decisao arquitetural relevante for necessaria, explica-la antes de
  implementar e registra-la como ADR em `docs/adr/`;
- quando uma integracao real ainda nao existir, criar abstracao bem definida e
  usar dados DEMO - nunca simular a integracao como se fosse real.

## Docker

- PostgreSQL 16 executa em container, obrigatoriamente.
- O Docker Compose contem **apenas PostgreSQL e Adminer**. Nao adicione Redis,
  filas, proxy, monitoramento ou qualquer outro servico sem necessidade
  demonstrada e acordada.
- Frontend, API e ETL executam nativamente por enquanto, mas devem permanecer
  containerizaveis: configuracao sempre por variavel de ambiente, nunca por
  caminho absoluto de maquina.

## Seguranca

- Nunca coloque segredo em codigo. Tudo por variavel de ambiente.
- Nunca versione `.env`. Atualize `.env.example` quando criar variavel nova, sem
  valor real.
- Nunca exponha credencial em log, mensagem de erro ou resposta HTTP.
- Valide toda entrada da API por schema. Sem SQL dinamico vindo do cliente.
- Detalhe interno de erro nao vaza para o cliente fora de desenvolvimento.
- Variaveis `NEXT_PUBLIC_*` chegam ao navegador: nunca coloque segredo nelas.
- Aplique menor privilegio: a API le; o ETL escreve.

## Qualidade

Codigo deve ser tipado, modular, legivel, testavel e documentado quando
necessario.

- TypeScript em modo `strict`; evite `any`.
- Respeite as fronteiras de package: se uma mudanca exige quebrar uma fronteira,
  discuta antes.
- Nomes de dominio em portugues (Municipio, Competencia, Internacao); termos de
  infraestrutura em ingles, conforme o padrao da ferramenta.
- Comentario explica **por que**, nao **o que**.
- Antes de concluir uma tarefa: `npm run typecheck`, `npm run lint`, e os testes
  do escopo alterado.
