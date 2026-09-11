# HealthMap Regional

Plataforma de inteligência territorial para saúde pública. Integra dados
públicos do **SIH/SUS**, **SIM**, **CNES**, **IBGE** e **SEADE** para analisar a
oncologia (neoplasias malignas, CID-10 C00–C97) nos 645 municípios do estado de
São Paulo.

Dois diferenciais: o **Radar de Risco Regional**, índice analítico experimental
que aponta municípios que merecem atenção, e o **fluxo assistencial** — para
onde os pacientes de cada município vão se internar.

> **Não é sistema clínico.** Não diagnostica, não prescreve e não avalia
> pacientes individualmente. Trabalha só com dados agregados por município.

---

## Estado atual

Produto navegável sobre dados **reais** de 2024:

| O que existe       | Detalhe                                                                                                                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dados              | 645 municípios e 17 Departamentos Regionais de Saúde (IBGE/SES-SP); internações oncológicas do SIH/SUS (12 competências de 2024); mortalidade do SIM (2023–2024); capacidade de leitos do CNES; população do IBGE; vulnerabilidade social IPVS/SEADE |
| Radar de Risco     | 7.740 índices municipais (645 × 12 competências) e 204 regionais (17 DRS × 12)                                                                                                                                                                       |
| Fluxo assistencial | 3.555 pares município de residência → município de internação em 2024, com 183.193 internações visíveis                                                                                                                                              |
| Interface          | Visão Geral, Radar de Risco, Radar Municipal (mapa interativo por indicador), Fluxo Assistencial (mapa de arcos), Regiões de Saúde (Radar Regional), catálogo e ficha de município, Metodologia, Sobre                                                                                 |
| Qualidade          | typecheck, lint e build limpos; 385 testes automatizados (API 67, DB 132, Risk 43, ETL 117, Web 26)                                                                                                                                                  |

**Em andamento:** redesign de interface — etapas E1 a E6 concluídas (design
system, mapa, Visão Geral, Radares, Fluxo Assistencial — Fase 5.11, ver
[`docs/fase-5.11-relatorio.md`](docs/fase-5.11-relatorio.md) —, Regiões de
Saúde); ver [`docs/design-system.md`](docs/design-system.md). Próxima etapa:
congelamento e fechamento.

**Fora do escopo atual:** autenticação e controle de acesso (Fase 6). A
aplicação **não deve ser exposta fora de ambiente local**. Todas as limitações
que afetam a leitura dos números estão em
[`docs/known-limitations.md`](docs/known-limitations.md).

---

## Guia rápido: rodar numa máquina nova

Numa máquina nova o banco de dados começa **vazio**. Há dois caminhos para
preenchê-lo:

|               | **Caminho A — restaurar o snapshot**                             | Caminho B — reconstruir via ETL                |
| ------------- | ---------------------------------------------------------------- | ---------------------------------------------- |
| Tempo         | segundos                                                         | horas                                          |
| Depende de    | nada: o snapshot **já vem no clone** (`data/snapshot/`, ~1,2 MB) | internet, DATASUS no ar, imagens Docker de ETL |
| Resultado     | **exatamente** os números desta base, conferidos automaticamente | números regenerados das fontes do dia          |
| Indicado para | **apresentação e demonstração**                                  | desenvolvimento e atualização de dados         |

**Para apresentar, use o Caminho A.** Ele foi testado de ponta a ponta, em
PowerShell: o banco restaurado reproduz os mesmos 7.740 índices, com o mesmo
checksum, da base de origem.

Os comandos de banco deste guia são scripts `npm` que chamam o Docker sem passar
por um shell. Isso é deliberado: digitados à mão, os comandos equivalentes
quebram de formas diferentes no Git Bash e no Windows PowerShell 5.1 (veja
[Solução de problemas](#solução-de-problemas)).

---

## Passo a passo na máquina nova

Comandos em **PowerShell**, sempre na raiz do repositório.

### 0. Pré-requisitos

| Ferramenta                   | Versão mínima                  | Testado com |
| ---------------------------- | ------------------------------ | ----------- |
| Node.js                      | 20.11                          | 20.13.1     |
| npm                          | 10                             | 10.5.2      |
| Docker Desktop (com Compose) | recente                        | 29.7.2      |
| Git                          | recente                        | —           |
| Python                       | 3.11 — **só para o Caminho B** | 3.14.2      |

Portas que precisam estar livres: **5432** (PostgreSQL), **8080** (Adminer),
**4000** (API) e **3000** (interface).

### 1. Abrir o Docker Desktop

Abra o Docker Desktop e espere o ícone da baleia parar de animar. Na maioria das
instalações **ele não abre sozinho** com o Windows — e sem ele todo comando
`docker` falha.

```powershell
docker ps
```

Deve mostrar uma tabela (mesmo vazia), não uma mensagem de erro.

### 2. Clonar e configurar

```powershell
git clone https://github.com/Ziror9/healthmap-regional.git
cd healthmap-regional
Copy-Item .env.example .env
```

Abra o `.env` e troque a senha em **dois lugares**, com o mesmo valor:

```dotenv
POSTGRES_PASSWORD=sua_senha_local
DATABASE_URL="postgresql://healthmap:sua_senha_local@localhost:5432/healthmap?schema=public"
```

Mantenha usuário e banco como `healthmap` — os scripts de snapshot usam esse
nome. O `.env` está no `.gitignore` e nunca deve ser versionado.

### 3. Instalar dependências

```powershell
npm install
```

O `npm install` também gera o cliente Prisma (script `postinstall`). No fim da
saída deve aparecer `Generated Prisma Client`.

### 4. Subir o banco

```powershell
npm run db:up
docker inspect -f "{{.State.Health.Status}}" healthmap-postgres
```

Repita o segundo comando até ele responder `healthy` (10 a 20 segundos na
primeira vez).

### 5. Restaurar o snapshot (Caminho A)

```powershell
npm run db:snapshot:restore
```

O script restaura `data/snapshot/healthmap.dump` e, na sequência, **confere o
banco contra o manifesto** que acompanha o arquivo. Resultado esperado:

```text
[snapshot] restaurando em "healthmap"...
[snapshot] restaurado. Conferindo contra o manifesto...
[snapshot] "healthmap" comparado ao snapshot de 2026-09-10T14:24:03.916Z:
  OK  RiskScore REAL (linhas)      7740
  OK  RiskScore REAL (checksum)    795de04de0a361231635c8532c53e510
  OK  Fluxo (pares)                3555
  OK  Fluxo (internacoes)          183193
  OK  Municipios                   660
  OK  Migrations aplicadas         7
[snapshot] integridade confirmada: o banco e identico ao snapshot.
```

Os 660 municípios são os 645 reais mais 15 sintéticos da base DEMO de
desenvolvimento, que a interface não mostra por padrão. O snapshot já inclui as
migrations — **não** rode nenhum comando `prisma migrate` depois de restaurar.

Por segurança, o script **só restaura em banco vazio**: se o banco já tiver
tabelas, ele recusa e diz como começar do zero.

Sem snapshot? Vá para o [Caminho B](#caminho-b--reconstruir-os-dados-via-etl).

### 6. Subir a API e a interface

Em **dois terminais** separados, ambos na raiz do repositório:

```powershell
npm run dev:api
```

```powershell
npm run dev:web
```

| Serviço            | Endereço                           | Pronto quando                                                      |
| ------------------ | ---------------------------------- | ------------------------------------------------------------------ |
| API                | http://localhost:4000/health/ready | responde HTTP `200`                                                |
| Interface          | http://localhost:3000              | a Visão Geral mostra "645 municípios de São Paulo"                 |
| Adminer (opcional) | http://localhost:8080              | sistema PostgreSQL, servidor `postgres`, usuário e senha do `.env` |

---

## Checklist do dia da apresentação

Faça **30 minutos antes**:

- [ ] Docker Desktop aberto; `docker ps` lista `healthmap-postgres` como `(healthy)`
- [ ] `npm run db:snapshot:verify` termina com "integridade confirmada"
- [ ] API e interface rodando (passo 6), sem erro nos terminais
- [ ] **Páginas aquecidas**: abra uma vez cada tela que vai mostrar. Em modo de
      desenvolvimento, a primeira visita a cada rota compila a página e pode
      levar uns 10 segundos — melhor que isso aconteça antes da banca
- [ ] Abas abertas na ordem da demonstração

### Telas

| Rota               | O que mostra                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `/`                | Visão Geral: indicadores com fonte e período, mapa do Radar, polos de atendimento, distribuição por Região de Saúde |
| `/radar`           | Ranking completo do Radar de Risco, filtrável por classificação e paginado                                          |
| `/radar-municipal` | Mapa por indicador (internações, mortalidade, vulnerabilidade, risco); o estado fica na URL                         |
| `/fluxo`           | Fluxo assistencial: polos, para onde vão os residentes e de onde vêm os pacientes, com arcos no mapa                |
| `/regioes`         | Radar Regional: um índice por DRS (distinto da média dos municípios), mapa, ranking e componentes da DRS           |
| `/municipios`      | Catálogo dos 645 municípios, com busca e filtro por região                                                          |
| `/municipios/[id]` | Ficha do município: índice, componentes, fluxo assistencial, indicadores                                            |
| `/metodologia`     | Como cada número é produzido — e o que ainda não é                                                                  |
| `/sobre`           | Contexto do produto                                                                                                 |

Links prontos para a demonstração (os ids valem para o snapshot versionado):

- `http://localhost:3000/municipios/302` — Jaú, um dos maiores polos de atendimento
- `http://localhost:3000/municipios/16` — Adamantina: 86% das internações acontecem fora do município
- `http://localhost:3000/radar-municipal?indicador=TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB&municipio=78` — Barretos, mortalidade oncológica
- `http://localhost:3000/fluxo?municipio=302&modo=destino` — Jaú: de onde vêm os 8.186 pacientes que atende (157 municípios)
- `http://localhost:3000/fluxo?municipio=16` — Adamantina: para onde vão os residentes
- `http://localhost:3000/regioes?regiao=17` — Registro, a DRS de maior índice regional em dez/2024

---

## Solução de problemas

| Sintoma                                                                                            | Causa                                                                                                           | O que fazer                                                                                                                              |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`                 | Docker Desktop fechado                                                                                          | Abra o Docker Desktop e espere estabilizar                                                                                               |
| `npm run db:up` falha com `defina POSTGRES_USER no .env`                                           | Falta o arquivo `.env`                                                                                          | `Copy-Item .env.example .env` (passo 2)                                                                                                  |
| `npm run db:up` falha com a porta `5432` em uso                                                    | Há um PostgreSQL instalado na própria máquina                                                                   | Pare o serviço local, **ou** troque `POSTGRES_PORT` no `.env` **e** a porta dentro da `DATABASE_URL`                                     |
| `[snapshot] container healthmap-postgres nao encontrado`                                           | O banco não subiu                                                                                               | `npm run db:up` e espere o `healthy` (passo 4)                                                                                           |
| `[snapshot] o banco "healthmap" ja tem N tabela(s)`                                                | Restauração por cima de um banco que já tem dados                                                               | `npm run db:reset` (**apaga o banco**), `npm run db:up`, `npm run db:snapshot:restore`                                                   |
| `npm run db:snapshot:verify` mostra linhas `DIF`                                                   | O banco não tem os mesmos dados do snapshot                                                                     | Restaure num banco vazio (linha acima). Se você reconstruiu pelo Caminho B, alguma diferença é esperada                                  |
| API não sobe: `@prisma/client did not initialize yet`                                              | Cliente Prisma não gerado                                                                                       | `npm run prisma:generate` (o `npm install` normalmente já faz)                                                                           |
| Interface abre, mas sem dados; o console do navegador mostra erro de **CORS**                      | A página foi aberta num endereço fora da lista `API_CORS_ORIGIN`                                                | O padrão aceita `http://localhost:3000` e `http://127.0.0.1:3000`. Para outro endereço, acrescente-o à lista no `.env` e reinicie a API  |
| Interface abre, mas mostra "Nenhum resultado" em tudo                                              | Banco vazio: snapshot não restaurado                                                                            | Passo 5                                                                                                                                  |
| `password authentication failed`                                                                   | A senha do `.env` mudou depois da primeira subida do banco                                                      | As variáveis `POSTGRES_*` só valem na criação do volume. `npm run db:reset` (**apaga o banco**) e refaça os passos 4 e 5                 |
| `npm run build` falha com `EPERM` em `.next\trace`                                                 | O `dev:web` está rodando e trava a pasta `.next`                                                                | Pare o `dev:web` antes do build                                                                                                          |
| Página em branco ou erro de hooks depois de editar código                                          | Hot reload do Next em estado inconsistente                                                                      | Recarregue a aba; se persistir, pare e suba o `dev:web` de novo                                                                          |
| A primeira abertura de uma tela demora ~10 s                                                       | Compilação sob demanda do modo de desenvolvimento                                                               | Normal — aqueça as páginas antes (checklist)                                                                                             |
| Comando `docker exec ... /tmp/...` digitado à mão no **Git Bash** falha com caminho `C:/Users/...` | O Git Bash reescreve caminhos Unix antes de chamar programas do Windows                                         | Use os scripts `npm run db:snapshot:*`, ou prefixe o comando com `MSYS_NO_PATHCONV=1`                                                    |
| `git clone` avisa `Filename too long`                                                              | O caminho completo passa do limite de 260 caracteres do Windows (o arquivo mais profundo do repositório tem 95) | Clone numa pasta com até 160 caracteres (ex.: `C:\dev\healthmap-regional`) ou, antes do clone, `git config --global core.longpaths true` |

Healthcheck da API:

```powershell
curl.exe http://localhost:4000/health
```

```json
{
  "status": "ok",
  "service": "healthmap-api",
  "version": "0.0.0",
  "environment": "development",
  "uptimeSeconds": 12,
  "timestamp": "..."
}
```

`/health/ready` também verifica o PostgreSQL: responde `200` com o banco
acessível e `503` sem ele.

---

## Atualizar o snapshot

O snapshot versionado é a fotografia da base usada nas apresentações. Se os
dados mudarem (por exemplo, depois de uma nova carga de ETL), gere outro e
versione **os dois arquivos juntos**:

```powershell
npm run db:snapshot:create
git add data/snapshot/healthmap.dump data/snapshot/healthmap.manifest.json
```

O manifesto guarda as medidas de conferência; um dump sem o manifesto
correspondente não pode ser verificado. O `.gitattributes` marca `*.dump` como
binário, para que a conversão de quebras de linha do Git nunca toque no arquivo.

---

## Caminho B — reconstruir os dados via ETL

Use quando for preciso atualizar os dados a partir das fontes. **Não é
recomendado na véspera de uma apresentação**: leva horas, depende do DATASUS
estar no ar e regenera os números a partir das fontes do dia — que podem ter
sido revisadas desde a carga original.

A sequência abaixo é a usada na recuperação documentada em
[`docs/fase-5.6-relatorio.md`](docs/fase-5.6-relatorio.md) (§9), que reproduziu a
base. Parta do banco vazio do passo 4.

**1. Estrutura do banco**

```powershell
npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
```

Use `migrate deploy`, **não** `npm run prisma:migrate`: aquele script roda
`prisma migrate dev`, que é interativo e serve para _criar_ migrations, não para
aplicar as existentes. O `migrate deploy` num banco vazio aplica as 7 migrations
e cria as 31 tabelas.

**2. Base DEMO** (usada pelos testes automatizados)

```powershell
npm run db:seed
```

**3. Dados de referência** (Python no host)

```powershell
pip install -r etl/requirements.txt
python etl/ingest_geografia.py
python etl/ingest_cnes.py
python etl/ingest_populacao.py
python etl/ingest_vulnerabilidade.py
```

**4. SIH, CNES histórico e SIM** (em containers: a biblioteca `pysus` não instala
no Windows)

```powershell
docker build -f etl/docker/Dockerfile.sih -t healthmap-etl-sih .
docker build -f etl/docker/Dockerfile.cnes_historico -t healthmap-etl-cnes-historico .
docker build -f etl/docker/Dockerfile.sim -t healthmap-etl-sim .

$url = "postgresql://healthmap:sua_senha_local@host.docker.internal:5432/healthmap?schema=public"
docker run --rm -e DATABASE_URL=$url healthmap-etl-sih
docker run --rm -e DATABASE_URL=$url healthmap-etl-cnes-historico
docker run --rm -e DATABASE_URL=$url healthmap-etl-sim
```

Dentro do container o banco se chama `host.docker.internal`, não `localhost`.

> ⚠️ `etl/docker/requirements-sih.txt` e `requirements-cnes-historico.txt`
> aceitam `pysus>=2.8,<3`. Uma versão nova do pysus já quebrou o build do SIM
> uma vez (a API interna mudou), e por isso o SIM está fixado em `==2.8.0`. Se o
> build do SIH ou do CNES falhar com `ImportError`, fixe `pysus==2.8.0` nesses
> dois arquivos.

**5. Cálculos** (nesta ordem)

```powershell
npm run db:calculate-risk
npm run db:calculate-risk-real
npm run db:calculate-risk-regional
npm run db:calculate-indicadores-real
npm run db:calculate-indicadores-mortalidade-real
```

Por fim, rode `npm run db:snapshot:verify`. Diferenças em relação ao manifesto
são possíveis se as fontes tiverem sido revisadas desde a carga original.
Detalhes de cada pipeline em [`etl/README.md`](etl/README.md).

---

## Testes

```powershell
npm run typecheck
npm run lint
npm run test --workspace @healthmap/api     # 60 testes - exige banco com dados
npm run test --workspace @healthmap/db      # 132 testes - exige banco com dados
npm run test --workspace @healthmap/risk    # 43 testes - puros, sem banco
python -m pytest etl/tests                   # 117 testes - puros, sem banco
```

Os testes de `packages/db` inserem e removem linhas de teste. Não rode contra um
banco que você não queira tocar.

---

## Scripts disponíveis

| Comando                       | O que faz                                                        |
| ----------------------------- | ---------------------------------------------------------------- |
| `npm run db:up`               | sobe PostgreSQL e Adminer                                        |
| `npm run db:down`             | para os containers (dados preservados)                           |
| `npm run db:reset`            | para os containers e **apaga** o volume de dados                 |
| `npm run db:logs`             | acompanha os logs do PostgreSQL                                  |
| `npm run db:check`            | verifica a conexão da aplicação com o banco                      |
| `npm run db:snapshot:create`  | gera `data/snapshot/healthmap.dump` e o manifesto de conferência |
| `npm run db:snapshot:restore` | restaura o snapshot num banco vazio e confere                    |
| `npm run db:snapshot:verify`  | confere o banco atual contra o manifesto                         |
| `npm run db:seed`             | carrega a base DEMO de desenvolvimento                           |
| `npm run db:calculate-*`      | recalcula Radar e indicadores (ver Caminho B)                    |
| `npm run prisma:generate`     | gera o cliente Prisma (roda sozinho no `npm install`)            |
| `npm run prisma:migrate`      | **cria** migrations — desenvolvimento, interativo                |
| `npm run prisma:studio`       | abre o Prisma Studio                                             |
| `npm run dev:api`             | API em modo desenvolvimento (porta 4000)                         |
| `npm run dev:web`             | interface em modo desenvolvimento (porta 3000)                   |
| `npm run build`               | build de todos os workspaces                                     |
| `npm run typecheck`           | verificação de tipos em todos os workspaces                      |
| `npm run lint`                | ESLint                                                           |
| `npm run format`              | Prettier                                                         |
| `npm run test`                | testes de todos os workspaces                                    |

---

## Stack

| Camada   | Tecnologias                                                   |
| -------- | ------------------------------------------------------------- |
| Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS, Lucide |
| Backend  | Node.js, TypeScript, Express, API REST somente leitura        |
| Banco    | PostgreSQL 16 em Docker, Prisma ORM                           |
| Dados    | Python (pandas, pySUS) — pipelines de ETL                     |
| Monorepo | npm workspaces                                                |

## Estrutura do projeto

```text
healthmap-regional/
├── apps/
│   ├── web/            Next.js - interface (nunca calcula índice; consome a API)
│   └── api/            Express - API REST (nunca escreve SQL; usa packages/db)
├── packages/
│   ├── db/             Prisma, migrations, repositórios e scripts de banco
│   ├── risk/           Radar de Risco (implementação única, sem I/O)
│   └── contracts/      tipos e contratos compartilhados web <-> api
├── etl/                pipelines Python (SIH, SIM, CNES, IBGE, IPVS)
├── data/snapshot/      snapshot versionado do banco + manifesto de conferência
├── docs/               arquitetura, metodologia, design system, relatórios de fase
├── docker-compose.yml  PostgreSQL + Adminer
├── CLAUDE.md           regras operacionais do projeto
└── README.md
```

## Documentação

| Documento                                                        | Conteúdo                                             |
| ---------------------------------------------------------------- | ---------------------------------------------------- |
| [`CLAUDE.md`](CLAUDE.md)                                         | regras operacionais e estado detalhado do projeto    |
| [`docs/architecture.md`](docs/architecture.md)                   | arquitetura, componentes e responsabilidades         |
| [`docs/roadmap.md`](docs/roadmap.md)                             | fases, entregas e critérios de conclusão             |
| [`docs/data-model.md`](docs/data-model.md)                       | modelo de dados                                      |
| [`docs/risk-methodology.md`](docs/risk-methodology.md)           | metodologia do Radar de Risco                        |
| [`docs/sih-methodology.md`](docs/sih-methodology.md)             | metodologia de ingestão do SIH/SUS                   |
| [`docs/design-system.md`](docs/design-system.md)                 | design system da interface                           |
| [`docs/known-limitations.md`](docs/known-limitations.md)         | limitações conhecidas                                |
| [`docs/adr/001-architecture.md`](docs/adr/001-architecture.md)   | decisões arquiteturais de base                       |
| `docs/fase-*-relatorio.md`                                       | relatório de cada fase: decisões, números, validação |
| [`etl/README.md`](etl/README.md)                                 | pipelines de dados                                   |
| [`apps/web/public/geo/README.md`](apps/web/public/geo/README.md) | fonte e licença da malha geográfica                  |

---

## Aviso

Este sistema não realiza diagnóstico, não prescreve tratamento e não avalia
pacientes individualmente. Trabalha exclusivamente com dados públicos agregados
por município. O Radar de Risco é um índice analítico **experimental** — nenhum
peso é oficial até ser calibrado e validado — e não é um instrumento clínico nem
uma avaliação de qualidade assistencial.
