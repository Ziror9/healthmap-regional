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

**Estado atual: Fase 4 (Dashboard) concluida, parcialmente.** Schema,
migrations, base DEMO, motor de risco (`packages/risk`), API REST
somente-leitura (`apps/api`) e um dashboard navegavel (`apps/web`) existem e
estao validados. Do indice, so `PRESSAO_HOSPITALAR_ESTIMADA` produz valor -
os componentes `TENDENCIA` e `SEVERIDADE` ficam estruturalmente prontos mas
sempre indisponiveis por lacunas metodologicas explicitas (nao
implementadas, nao inventadas). O frontend consome a API (Visao Geral,
Radar de Risco, Municipios, detalhe de municipio, Metodologia, Sobre) com
identidade visual propria (tema claro, azul institucional, escala de risco
nunca so cor) - publico, sem autenticacao, igual a API. **Nao ha mapa
geografico**: sem GeoJSON oficial nem lat/long populados, a Visao Geral
mostra esse bloqueio explicitamente e usa agrupamento por Regiao de Saude
como alternativa. Ver
[`docs/fase-1-relatorio.md`](docs/fase-1-relatorio.md),
[`docs/fase-2-relatorio.md`](docs/fase-2-relatorio.md),
[`docs/fase-3-relatorio.md`](docs/fase-3-relatorio.md) e
[`docs/fase-4-relatorio.md`](docs/fase-4-relatorio.md).

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
