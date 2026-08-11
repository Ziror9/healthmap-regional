# Arquitetura - HealthMap Regional

> Estado: Fase 0 (fundacao) concluida. Este documento descreve a arquitetura
> alvo do MVP e o que efetivamente existe hoje.

## 1. Visao geral

O HealthMap Regional e uma plataforma de inteligencia analitica para saude
publica. Integra dados publicos do **SIH/SUS**, **CNES** e **IBGE** para
monitorar internacoes hospitalares por municipio, com foco inicial em oncologia
(neoplasias malignas, CID-10 C00-C97), no estado de Sao Paulo.

O produto **nao** e um sistema clinico nem transacional hospitalar. E um produto
analitico de apoio a decisao de gestao, alimentado por dados publicos agregados.
Essa classificacao determina quase todas as decisoes tecnicas: leitura pesada,
escrita leve, nenhum dado individual.

## 2. Pipeline conceitual

```
Fontes -> Ingestao -> Validacao -> Transformacao -> Armazenamento
       -> Camada analitica -> API -> Dashboard
```

Mapeado para os componentes do repositorio:

| Etapa              | Componente                | Fase |
| ------------------ | ------------------------- | ---- |
| Ingestao/Validacao | `etl/` (Python)           | 5    |
| Armazenamento      | PostgreSQL + `packages/db`| 1    |
| Camada analitica   | `packages/risk`           | 2    |
| API                | `apps/api`                | 3    |
| Dashboard          | `apps/web`                | 4    |
| Contratos          | `packages/contracts`      | 0    |

## 3. Componentes e responsabilidades

### apps/web - Frontend

Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, Lucide React.
Responsavel por apresentacao e interacao. Nao contem regra de negocio analitica
e nunca calcula indices: consome a API.

### apps/api - Backend

Node.js, TypeScript, Express, API REST. Camadas:

```
routes -> controllers -> services -> (packages/db) repositorios -> PostgreSQL
```

Regras:

- toda resposta analitica sai embrulhada no envelope de proveniencia;
- nenhuma consulta SQL vive aqui;
- a API e majoritariamente somente-leitura; escrita fica restrita a
  administracao (configuracao de pesos, usuarios).

### packages/db - Acesso a dados

Prisma, schema, migrations e repositorios. **Fronteira unica** de acesso ao
banco. Nenhum SQL fora deste package. E essa disciplina que torna viavel a
migracao futura para Oracle (OCI) sem reescrever a aplicacao.

### packages/risk - Radar de Risco

Implementacao unica do indice. Modulo puro e testavel: recebe insumos, devolve
indice. Sem acesso a banco, sem HTTP, sem formatacao.

### packages/contracts - Contratos compartilhados

Tipos e schemas (Zod) usados por `apps/web` e `apps/api`. Fonte unica de verdade
dos enums de proveniencia e do envelope.

### etl/ - Pipelines Python

Ingestao, validacao, transformacao e agregacao. A agregacao e o ponto de
anonimizacao do sistema.

## 4. Comunicacao entre componentes

```
apps/web  --HTTP/JSON-->  apps/api  --funcoes-->  packages/db  --SQL-->  PostgreSQL
                              |
                              +--funcoes-->  packages/risk (leitura de resultados)

etl/ (Python)  --SQL/carga-->  PostgreSQL
```

- `apps/web` conhece apenas HTTP e `@healthmap/contracts`;
- `apps/api` nao conhece SQL;
- `etl/` nao conhece HTTP;
- `packages/risk` nao conhece nem SQL nem HTTP.

## 5. Invariantes arquiteturais

Regras que, se violadas, quebram o produto conceitualmente. Devem ser garantidas
por estrutura, nao por disciplina:

1. **Nao existe dado individual no banco da aplicacao.** O schema nao tera campo
   capaz de armazenar identificador de paciente ou numero de AIH.
2. **Nenhum numero sai da API sem proveniencia.** O envelope e obrigatorio no
   contrato compartilhado.
3. **Uma unica implementacao do indice de risco**, em `packages/risk`.
4. **Residencia e internacao nunca se misturam**: tabelas, tipos e endpoints
   separados.
5. **Acesso a dados so por repositorios**, em `packages/db`.

## 6. Estrategia de monorepo

**npm workspaces**, sem ferramenta adicional (Turborepo, Nx, Lerna). Ver
[ADR-001](./adr/001-architecture.md).

Packages internos (`@healthmap/contracts`, `@healthmap/db`, `@healthmap/risk`)
sao consumidos como **codigo-fonte TypeScript**, sem etapa de build propria:

- `apps/web` usa `transpilePackages` do Next.js;
- `apps/api` usa `tsx` em desenvolvimento e `tsup` no build (com `noExternal`
  para empacotar os packages internos).

Isso elimina a orquestracao de builds encadeados que justificaria Turborepo.

## 7. Docker

Na Fase 0 o Docker Compose contem **apenas PostgreSQL 16 e Adminer**. Frontend,
API e ETL executam nativamente na maquina do desenvolvedor.

A containerizacao dos demais servicos e possivel sem refatoracao porque:

- toda configuracao vem de variaveis de ambiente;
- a API escuta em host e porta configuraveis;
- o ETL nao dependera de caminho absoluto da maquina;
- cada workspace declara as proprias dependencias.

## 8. PostgreSQL

PostgreSQL 16 em container, com volume nomeado (`healthmap_pgdata`), healthcheck
(`pg_isready`) e credenciais vindas do `.env` da raiz.

Organizacao prevista para a Fase 1:

| Schema   | Conteudo                                             |
| -------- | ---------------------------------------------------- |
| `silver` | dados padronizados e ja agregados                    |
| `gold`   | marts analiticos consumidos pela API                 |
| `meta`   | configuracao, linhagem, qualidade, RBAC, auditoria   |

A camada **Bronze** (arquivos brutos imutaveis) fica fora do banco, em
`data/bronze/`, nao versionada.

## 9. Prisma

- schema em `packages/db/prisma/schema.prisma`;
- conexao via `DATABASE_URL` do `.env` da raiz;
- comandos executados a partir da raiz (`npm run prisma:migrate`), para que o
  Prisma leia o mesmo `.env` que a API.

Na Fase 0 o schema nao possui entidades: apenas `datasource` e `generator`.

## 10. Preparacao para OCI

OCI e arquitetura futura, nao dependencia do MVP. A migracao permanece viavel
porque o acesso a dados esta isolado em `packages/db`, o SQL analitico ficara
concentrado em repositorios e nenhum servico proprietario (incluindo Select AI)
faz parte do MVP.
