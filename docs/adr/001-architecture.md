# ADR-001 - Arquitetura de base do HealthMap Regional

- **Status:** aceito
- **Data:** Fase 0
- **Escopo:** decisoes estruturais que valem para todo o MVP

Cada decisao abaixo segue o formato **Contexto / Decisao / Consequencias**.

---

## 1. Monorepo com npm workspaces

**Contexto.** O projeto tem cinco artefatos que compartilham tipos e regras:
frontend, API, acesso a dados, motor de risco e contratos. Repositorios
separados fariam os contratos divergirem; ferramentas de monorepo (Turborepo,
Nx, Lerna) resolvem orquestracao de builds encadeados e cache distribuido -
problemas que este projeto ainda nao tem.

**Decisao.** Monorepo unico gerenciado por **npm workspaces**, sem ferramenta
adicional. Packages internos sao consumidos como codigo-fonte TypeScript
(`transpilePackages` no Next.js, `tsx`/`tsup` na API), o que elimina a cadeia de
builds que justificaria Turborepo.

**Consequencias.** Setup simples e sem dependencia extra. Um contrato so pode
mudar em um lugar. Se o tempo de build se tornar um problema real, adotar
Turborepo depois e aditivo e nao exige reorganizar o repositorio.

---

## 2. Next.js + React + TypeScript no frontend

**Contexto.** O produto precisa ter aparencia de plataforma profissional de
Health Intelligence, com mapas, graficos e boa performance de carga sobre dados
agregados.

**Decisao.** Next.js (App Router) com React, TypeScript, Tailwind CSS, shadcn/ui
e Lucide React.

**Consequencias.** Renderizacao no servidor para paginas analiticas cacheaveis.
shadcn/ui entrega componentes acessiveis sem impor identidade visual, o que
permite construir a estetica corporativa desejada. O frontend nunca calcula
indices: consome a API.

---

## 3. Node.js + TypeScript com API REST no backend

**Contexto.** O consumo e majoritariamente leitura de agregados, com filtros
conhecidos e finitos. TypeScript de ponta a ponta permite compartilhar contratos
sem duplicacao.

**Decisao.** API REST em Node.js com TypeScript e Express, organizada em
`routes -> controllers -> services -> repositorios`. GraphQL foi descartado:
consultas livres nao combinam com supressao de celulas pequenas e controle de
exposicao de dados sensiveis.

**Consequencias.** Superficie de consulta explicita e auditavel. Cada endpoint
sabe exatamente o que expoe - condicao para aplicar supressao e, depois, RBAC.
Nenhum SQL dinamico vindo do cliente.

---

## 4. PostgreSQL como banco do MVP

**Contexto.** A carga e analitica sobre volumes moderados (645 municipios x ate
60 competencias x recortes). O material de origem previa Oracle Autonomous
Database; a diretriz do projeto define PostgreSQL para o MVP.

**Decisao.** PostgreSQL 16 como banco unico, com organizacao em schemas
`silver`, `gold` e `meta`.

**Consequencias.** Sem custo de nuvem e sem licenca para desenvolver. Recursos
analiticos suficientes (window functions, percentis, particionamento). A camada
Bronze fica fora do banco, em arquivos imutaveis.

---

## 5. Prisma como ORM, isolado em packages/db

**Contexto.** Tipagem forte entre banco e aplicacao reduz uma classe inteira de
erros. Porem, acoplar a aplicacao ao ORM inviabilizaria a migracao futura.

**Decisao.** Prisma dentro de `packages/db`, que e a **fronteira unica** de
acesso a dados. Nenhuma chamada Prisma e nenhum SQL existem fora deste package.

**Consequencias.** Migracao para outro banco (incluindo Oracle) altera um
package, nao a aplicacao. Consultas analiticas pesadas usarao SQL cru quando
necessario - tambem dentro de `packages/db`.

---

## 6. Python para os pipelines de dados

**Contexto.** As fontes publicas de saude brasileiras tem ferramental maduro em
Python (pySUS para os arquivos `.dbc` do DATASUS), e o ecossistema de analise
(pandas, numpy) e o padrao da area.

**Decisao.** Ingestao, validacao, transformacao e agregacao em Python, em `etl/`,
separado das aplicacoes TypeScript.

**Consequencias.** Duas linguagens no repositorio, com fronteira nitida: Python
escreve no banco, TypeScript le. O ETL nao conhece HTTP; a API nao processa
arquivo bruto. O ETL entrega insumos do Radar, mas nunca calcula o indice.

---

## 7. Docker para padronizacao do ambiente

**Contexto.** Divergencia de versao de banco entre maquinas produz bugs que so
aparecem no ambiente de alguem.

**Decisao.** Docker Compose com **apenas PostgreSQL 16 e Adminer**. Nenhum outro
servico (Redis, filas, proxy, monitoramento) sera adicionado sem necessidade
demonstrada.

**Consequencias.** Ambiente reproduzivel com um comando, sem a complexidade de
orquestrar toda a stack em containers durante o desenvolvimento.

---

## 8. PostgreSQL em container; demais servicos apenas preparados

**Contexto.** Containerizar frontend, API e ETL agora acrescentaria rebuilds e
atrito de hot reload sem beneficio nesta fase.

**Decisao.** Somente o banco roda em container. Frontend, API e ETL executam
nativamente, mas sao mantidos "container-ready": toda configuracao vem de
variaveis de ambiente, a API escuta em host e porta configuraveis, e cada
workspace declara as proprias dependencias.

**Consequencias.** Acrescentar um `Dockerfile` por servico na fase de producao
sera aditivo, sem refatoracao.

---

## 9. Separacao frontend/backend

**Contexto.** Seria possivel usar apenas Next.js com route handlers.

**Decisao.** API separada em `apps/api`.

**Consequencias.** A API pode servir outros consumidores (exportacoes,
integracoes, futura interface de consulta em linguagem natural) sem depender do
frontend. O contrato entre as camadas fica explicito e testavel. O custo e um
processo a mais em desenvolvimento.

---

## 10. Packages compartilhados (contracts, db, risk)

**Contexto.** Tres regras do produto precisam ser garantidas por estrutura, e
nao por disciplina: proveniencia obrigatoria, implementacao unica do indice e
isolamento do acesso a dados.

**Decisao.** Tres packages com fronteiras explicitas: `@healthmap/contracts`
(tipos e envelope), `@healthmap/db` (acesso a dados), `@healthmap/risk` (indice).

**Consequencias.** O envelope de proveniencia esta no caminho de qualquer
resposta da API. O indice tem uma implementacao so. Violar qualquer uma dessas
regras exige quebrar uma fronteira de package, o que e visivel em revisao de
codigo.

---

## 11. Proveniencia em dois eixos (Origem x Natureza)

**Contexto.** O projeto exige distinguir REAL, DEMO, ESTIMATIVA e PROJECAO. Um
enum unico com esses quatro valores nao representa combinacoes reais: uma
estimativa calculada sobre a base DEMO precisaria escolher um rotulo e perder o
outro.

**Decisao.** Dois eixos ortogonais - `Origem` (REAL | DEMO) e `Natureza`
(OBSERVADO | ESTIMATIVA | PROJECAO). A interface exibe os quatro rotulos
exigidos, derivando-os da combinacao.

**Consequencias.** Nenhuma informacao se perde e a ambiguidade desaparece. Custo:
dois campos em vez de um em toda entidade de fato e no envelope da API.

---

## 12. Preparacao para OCI, sem dependencia no MVP

**Contexto.** O material de origem previa Oracle Cloud Infrastructure (Object
Storage, Autonomous Database, Data Integrator, Analytics Cloud, Select AI). A
diretriz do projeto define OCI como arquitetura futura.

**Decisao.** Nenhum servico proprietario Oracle no MVP. A migracao permanece
viavel por construcao: acesso a dados isolado em `packages/db`, SQL analitico
concentrado, ETL desacoplado da aplicacao e configuracao por variavel de
ambiente.

**Consequencias.** O MVP e desenvolvido e demonstrado sem custo de nuvem. A
funcionalidade de consulta em linguagem natural (Select AI) fica adiada e,
quando entrar, sera plugada como contrato "pergunta -> consulta parametrizada
segura", nunca como SQL livre gerado por modelo contra o banco.
