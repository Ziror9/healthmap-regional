# HealthMap Regional

Plataforma de inteligencia analitica para saude publica regional. Integra dados
publicos do **SIH/SUS**, **CNES** e **IBGE** para monitorar internacoes
hospitalares por municipio, com foco inicial em oncologia (neoplasias malignas,
CID-10 C00-C97) no estado de Sao Paulo.

O diferencial do produto e o **Radar de Risco Regional**, um indice analitico
experimental que combina Pressao Hospitalar Estimada, tendencia, severidade e
vulnerabilidade para apontar municipios que merecem maior atencao do gestor.

> **Estado atual: Fase 0 - fundacao.** Existe estrutura tecnica, nao existe
> produto. Nao ha dashboard, indicadores, Radar calculado nem dados carregados.
> Ver [`docs/roadmap.md`](docs/roadmap.md) e
> [`docs/known-limitations.md`](docs/known-limitations.md).

## Stack

| Camada        | Tecnologias                                                          |
| ------------- | -------------------------------------------------------------------- |
| Frontend      | Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, Lucide React     |
| Backend       | Node.js, TypeScript, Express (API REST)                              |
| Banco         | PostgreSQL 16 (Docker), Prisma ORM                                   |
| Dados         | Python (pipelines ETL - Fase 5)                                      |
| Monorepo      | npm workspaces                                                       |

Oracle Cloud Infrastructure e arquitetura futura, nao dependencia do MVP.

## Pre-requisitos

- Node.js 20.11 ou superior
- npm 10 ou superior
- Docker e Docker Compose
- Python 3.11 ou superior (apenas a partir da Fase 5)

## Como comecar

### 1. Clonar e configurar o ambiente

```bash
git clone <url-do-repositorio>
cd healthmap-regional
cp .env.example .env
```

Edite o `.env` e troque `POSTGRES_PASSWORD` por uma senha local. Ajuste a
`DATABASE_URL` para refletir usuario, senha, host, porta e database.

O arquivo `.env` esta no `.gitignore` e nunca deve ser versionado.

### 2. Instalar dependencias

```bash
npm install
```

Um unico `npm install` na raiz instala todos os workspaces.

### 3. Subir PostgreSQL e Adminer

```bash
npm run db:up
```

Sobe dois containers:

| Servico    | Endereco                | Observacao                              |
| ---------- | ----------------------- | --------------------------------------- |
| PostgreSQL | `localhost:5432`        | volume persistente `healthmap_pgdata`   |
| Adminer    | http://localhost:8080   | apenas desenvolvimento                  |

Para conectar pelo Adminer: sistema `PostgreSQL`, servidor `postgres`, e
usuario, senha e base conforme o `.env`.

Outros comandos:

```bash
npm run db:logs    # acompanhar os logs do PostgreSQL
npm run db:down    # parar os containers (dados preservados)
npm run db:reset   # parar e APAGAR o volume de dados
```

### 4. Gerar o cliente Prisma e verificar a conexao

```bash
npm run prisma:generate
npm run db:check
```

`db:check` deve responder `[db] conexao OK`.

Na Fase 0 o schema nao possui entidades ainda, entao `prisma migrate dev` nao e
necessario. O comando esta disponivel para a Fase 1:

```bash
npm run prisma:migrate
```

### 5. Executar a API

```bash
npm run dev:api
```

Disponivel em http://localhost:4000.

### 6. Executar o frontend

Em outro terminal:

```bash
npm run dev:web
```

Disponivel em http://localhost:3000.

## Healthcheck

```bash
curl http://localhost:4000/health
```

```json
{
  "status": "ok",
  "service": "healthmap-api",
  "version": "0.0.0",
  "environment": "development",
  "uptimeSeconds": 12,
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

Readiness, que tambem verifica o PostgreSQL:

```bash
curl http://localhost:4000/health/ready
```

Responde `200` quando o banco esta acessivel e `503` quando nao esta.

## Scripts disponiveis

| Comando                    | O que faz                                        |
| -------------------------- | ------------------------------------------------ |
| `npm run db:up`            | sobe PostgreSQL e Adminer                        |
| `npm run db:down`          | para os containers                               |
| `npm run db:reset`         | para os containers e apaga o volume              |
| `npm run db:check`         | verifica a conexao com o banco                   |
| `npm run prisma:generate`  | gera o cliente Prisma                            |
| `npm run prisma:migrate`   | cria e aplica migrations                         |
| `npm run prisma:studio`    | abre o Prisma Studio                             |
| `npm run dev:api`          | API em modo desenvolvimento                      |
| `npm run dev:web`          | frontend em modo desenvolvimento                 |
| `npm run build`            | build de todos os workspaces                     |
| `npm run typecheck`        | verificacao de tipos em todos os workspaces      |
| `npm run lint`             | ESLint                                           |
| `npm run format`           | Prettier                                         |

## Estrutura do projeto

```
healthmap-regional/
├── apps/
│   ├── web/            Next.js - interface do produto
│   └── api/            Node + Express - API REST
├── packages/
│   ├── db/             Prisma, conexao e repositorios (fronteira de dados)
│   ├── risk/           Radar de Risco (implementacao unica) - Fase 2
│   └── contracts/      tipos e contratos compartilhados web <-> api
├── etl/                pipelines Python - Fase 5
├── docs/
│   ├── adr/            decisoes arquiteturais
│   ├── architecture.md
│   ├── roadmap.md
│   ├── data-model.md
│   ├── risk-methodology.md
│   └── known-limitations.md
├── docker-compose.yml
├── CLAUDE.md           documentacao operacional para desenvolvimento
└── README.md
```

## Documentacao

| Documento                                            | Conteudo                                     |
| ---------------------------------------------------- | -------------------------------------------- |
| [`CLAUDE.md`](CLAUDE.md)                             | regras operacionais do projeto                |
| [`docs/architecture.md`](docs/architecture.md)       | arquitetura, componentes e responsabilidades  |
| [`docs/roadmap.md`](docs/roadmap.md)                 | fases, entregas e criterios de conclusao      |
| [`docs/data-model.md`](docs/data-model.md)           | modelo conceitual de dados                    |
| [`docs/risk-methodology.md`](docs/risk-methodology.md) | conceito do Radar de Risco                  |
| [`docs/known-limitations.md`](docs/known-limitations.md) | limitacoes conhecidas                     |
| [`docs/adr/001-architecture.md`](docs/adr/001-architecture.md) | decisoes arquiteturais de base     |

## Aviso

Este sistema nao realiza diagnostico, nao prescreve tratamento e nao avalia
pacientes individualmente. Trabalha exclusivamente com dados agregados por
municipio. O Radar de Risco e um indice analitico experimental, nao um
instrumento clinico.
