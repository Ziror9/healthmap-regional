# Fase 1 — Relatório de Implementação

## 1. Status

**CONCLUÍDA**

## 2. O que foi implementado

- Schema Prisma completo da Fase 1, nos três schemas PostgreSQL (`silver`,
  `gold`, `meta`), com 22 tabelas, 14 enums, todas as chaves estrangeiras
  (incluindo as cross-schema), índices de consulta e constraints de
  idempotência.
- Migration única (`20260812134223_fase1_dominio`) gerada pelo Prisma e
  editada manualmente para incluir CHECK constraints e um índice único
  parcial que o DSL do Prisma não expressa nativamente.
- Gerador de seed DEMO determinístico (`packages/db/src/scripts/seed-demo.ts`),
  executável via `npm run db:seed`.
- Suite de testes de integração mínima (`packages/db/src/__tests__/fase1.test.ts`,
  11 casos) cobrindo os itens obrigatórios da Fase 1.
- Atualização da documentação (`docs/data-model.md`, `docs/known-limitations.md`,
  `docs/roadmap.md`, `CLAUDE.md`) refletindo o estado real implementado.

**Spike de `multiSchema`:** não foi refeito nesta rodada. Já havia sido
validado tecnicamente na sessão anterior (mesmo dia), com resultado positivo
e um achado relevante incorporado ao design: o preview feature `multiSchema`
está **deprecated** no Prisma 6.19.3 — funciona nativamente sem precisar ser
declarado. O `schema.prisma` desta fase já reflete isso (sem
`previewFeatures`). Refazer o spike seria trabalho redundante.

## 3. Schema criado

| Schema | Tabelas | Entidades |
|---|---|---|
| `silver` | 5 | RegiaoSaude, Municipio, Competencia, GrupoCid, Estabelecimento |
| `gold` | 7 | FatoInternacaoResidencia, FatoInternacaoLocal, FatoCapacidadeLeitos, Populacao, IndicadorMunicipal, RiskComponenteValor, RiskScore |
| `meta` | 10 | IndicadorDefinicao, RiskConfig, RiskConfigComponente, FonteDados, IngestaoExecucao, QualidadeCheck, AuditLog, Usuario, PerfilAtribuicao, EscopoTerritorial |

Constraints customizadas (não expressáveis no DSL do Prisma, adicionadas
manualmente na migration):

- `CHECK` em `Competencia` (mês 1–12, dias 28–31);
- `CHECK` em `FatoInternacaoResidencia`/`FatoInternacaoLocal` (consistência
  supressão↔medidas NULL, não-negatividade);
- `CHECK` em `FatoCapacidadeLeitos` (não-negatividade);
- `CHECK` em `RiskConfigComponente.peso` (0–1);
- índice único parcial em `RiskConfig` garantindo no máximo uma linha com
  `oficial = true`.

## 4. Migrations

```
npx prisma migrate dev --schema packages/db/prisma/schema.prisma --name fase1_dominio --create-only
# edição manual do migration.sql (CHECKs + índice parcial)
npx prisma migrate dev --schema packages/db/prisma/schema.prisma
```

Resultado: migration aplicada com sucesso, `prisma generate` executado
automaticamente ao final. Validado contra o Postgres bruto (`psql \dn`,
`information_schema.tables`, `pg_constraint`, `pg_indexes`) — os 3 schemas,
as 22 tabelas e todas as constraints customizadas existem exatamente como
especificado.

## 5. Seed DEMO

`npm run db:seed` — determinístico via PRNG seedado (mulberry32,
`SEED_DETERMINISTICO = 20250101`), idempotente via `upsert` em todas as
tabelas (reexecutar converge para o mesmo estado, não duplica).

Escopo gerado (pequeno, deliberadamente): 15 municípios ilustrativos de SP
(nomes reais, códigos IBGE **sintéticos** — ver seção 10), 5 regiões de
saúde ilustrativas, 6 competências (2025-01 a 2025-06), 1 `GrupoCid`
(C00-C97), 1 `RiskConfig` estrutural sem pesos.

| Tabela | Linhas | Observação |
|---|---|---|
| Municipio | 15 | |
| RegiaoSaude | 5 | |
| Competencia | 6 | |
| GrupoCid | 1 | |
| Populacao | 270 | |
| FatoInternacaoResidencia | 1.620 | 631 normais / 989 suprimidas |
| FatoInternacaoLocal | 1.620 | 451 normais / 1.169 suprimidas |
| FatoCapacidadeLeitos | 360 | sem supressão (não se aplica) |
| FonteDados | 1 | `GERADOR_DEMO` |
| IngestaoExecucao | 7 | 1 de referência + 1 por competência |
| RiskConfig | 1 | `oficial=false`, sem componentes |

Determinismo confirmado empiricamente: seed executado duas vezes, checksums
(`count` + `sum`) idênticos nas duas rodadas.

## 6. Proveniência e linhagem

- Todo fato `gold` gerado tem `origem = DEMO` e `execucaoId` apontando para
  uma `IngestaoExecucao` cuja `fonteDadosId = 'GERADOR_DEMO'` — validado por
  query (0 fatos com origem diferente de DEMO, 0 fatos com `execucaoId`
  órfão, 0 execuções de fonte diferente de `GERADOR_DEMO`).
- **Decisão final sobre `Natureza`** (revertendo uma proposta intermediária
  desta sessão): `FatoInternacaoResidencia`, `FatoInternacaoLocal`,
  `FatoCapacidadeLeitos` e `Populacao` não têm coluna `natureza` — é sempre
  `OBSERVADO` por construção. Só `RiskComponenteValor` e `RiskScore`
  persistem `natureza` por linha (onde ela pode realmente variar).
  `IndicadorMunicipal` usaria a natureza fixa de `IndicadorDefinicao`, mas
  nenhuma linha de `IndicadorMunicipal`/`IndicadorDefinicao` foi semeada
  nesta fase (fora do escopo explícito do seed pedido).

## 7. Supressão

Regra `n < 5` aplicada no seed, na granularidade mínima do fato
(`FatoInternacaoResidencia`/`FatoInternacaoLocal`): células com contagem
abaixo do limiar recebem `suprimido = true` e todas as medidas numéricas
(`internacoes`, `obitos`, `diasPermanencia`/`pacientesDia`/`diariasUti`)
`NULL`. Reforçado por CHECK constraint no banco (não é só disciplina do
gerador).

**Não implementado, por instrução explícita — pertence à Fase 3:**
agregação, reaplicação da supressão sobre combinações de filtro, e
mascaramento de totais na API. Risco documentado em
`docs/known-limitations.md` §5.1: soma ingênua via SQL `SUM()` ignora `NULL`
silenciosamente e pode subestimar um total sem sinalizar que está
incompleto.

## 8. Testes executados

| # | Comando | Resultado |
|---|---|---|
| — | `npm install` | OK (351→+34 pacotes, sem erro bloqueante) |
| — | `npm run prisma:generate` | OK — Prisma Client v6.19.3 gerado |
| — | `npm run db:up` | OK — `healthmap-postgres` (healthy), `healthmap-adminer` (up) |
| — | `npm run db:check` | OK — `[db] conexao OK` |
| — | `npx prisma migrate dev` (fase1_dominio) | OK — aplicada, 22 tabelas + constraints |
| — | `npm run db:seed` | OK — ver seção 5 |
| — | `npm run db:seed` (2ª vez) | OK — checksums idênticos (determinismo/idempotência) |
| — | `npm run test --workspace @healthmap/db` (vitest) | OK — **11/11 testes passando** |
| — | `npm run typecheck` (todos os workspaces) | OK — sem erros |
| — | `npm run lint` (todo o repositório) | OK — sem erros |
| — | Consultas SQL diretas (supressão, linhagem, origem, FK, unique, CHECK, índice parcial) | OK — todas as violações testadas foram corretamente rejeitadas pelo banco |

Os 11 testes automatizados cobrem exatamente a lista de "testes mínimos
obrigatórios" pedida (conexão, migration aplicada, seed executa, seed
determinístico, linhagem sem órfãos, origem DEMO, supressão abaixo do
limiar, medidas NULL quando suprimido, unique constraint, FK, e — um
adicional — o índice parcial de `RiskConfig.oficial`). TypeScript e ESLint
são validados como comandos separados (itens 11/12 da lista), não dentro do
vitest.

## 9. Problemas encontrados e soluções

1. **Docker Desktop não iniciava via automação** (sessão anterior, não desta
   implementação) — resolvido pelo usuário iniciando manualmente.
2. **Bug no gerador de código IBGE sintético**: a função inicial truncava o
   `codigoIbge6` de forma que todos os índices 1–9 colidiam no mesmo valor
   (`Unique constraint failed`). Corrigido invertendo a construção (o índice
   agora vive no `codigo6`, e o `codigo7` é `codigo6 + dígito`).
3. **`@rollup/rollup-win32-x64-msvc` ausente após `npm install`** (bug
   conhecido do npm com dependências opcionais específicas de plataforma —
   [npm/cli#4828](https://github.com/npm/cli/issues/4828)), impedindo o
   vitest de rodar. Corrigido reinstalando o pacote nativo especificamente
   (`npm install @rollup/rollup-win32-x64-msvc --force`), sem precisar
   apagar `node_modules` inteiro.
4. **Cache de leitura do `schema.prisma` desincronizado** durante a escrita
   do arquivo (ferramenta interna) — resolvido relendo o arquivo antes de
   reescrever.

Nenhum desses exigiu contornar a causa raiz: todos foram corrigidos na
origem, não mascarados.

## 10. Limitações conhecidas

Documentadas em detalhe em `docs/known-limitations.md` (seções 2, 5, 5.1).
Resumo:

- **Geografia da Fase 1 não é oficial.** Apenas 15 municípios (nomes reais)
  com **códigos IBGE sintéticos** (sequência deliberadamente não-realista) e
  5 regiões de saúde ilustrativas — não a carga completa e oficial de 645
  municípios prevista no roadmap. Decisão explícita: não fabricar 645
  códigos IBGE de memória, o que violaria a regra do projeto de nunca
  apresentar dado inventado como se fosse fonte oficial. A carga oficial
  completa fica pendente para quando houver uma fonte machine-readable a
  ingerir.
- `FaixaEtaria` (decenal) e `TipoLeito` (simplificada) são taxonomias
  provisórias, não confrontadas com o padrão real do SIH/CNES.
- Limiar de supressão (`n < 5`) não está versionado em banco junto da
  metodologia do Radar — é um parâmetro do gerador/ETL, documentado como
  sujeito a revisão.
- Reaplicação de supressão sobre agregações/filtros combinados: não
  implementada (Fase 3).
- `RiskComponenteValor`, `RiskScore`, `IndicadorMunicipal`,
  `IndicadorDefinicao`, `Estabelecimento`, `QualidadeCheck` e todas as
  tabelas de RBAC: schema criado e migrado, **zero linhas** — estrutura
  pronta, nada calculado/populado (fora do escopo pedido para o seed desta
  fase).

## 11. Arquivos alterados

**Novos:**
- `packages/db/prisma/migrations/20260812134223_fase1_dominio/migration.sql`
- `packages/db/prisma/migrations/migration_lock.toml`
- `packages/db/src/scripts/seed-demo.ts`
- `packages/db/src/__tests__/fase1.test.ts`
- `docs/fase-1-relatorio.md` (este arquivo)

**Modificados:**
- `packages/db/prisma/schema.prisma` (vazio → schema completo da Fase 1)
- `packages/db/package.json` (scripts `seed`/`test`, devDependency `vitest`)
- `package.json` (raiz — script `db:seed`)
- `package-lock.json` (dependências novas)
- `docs/data-model.md`, `docs/known-limitations.md`, `docs/roadmap.md`,
  `CLAUDE.md` (estado atualizado para refletir a Fase 1 implementada)

Nenhum arquivo de `apps/web`, `apps/api`, `packages/contracts`, `packages/risk`
ou `etl/` foi alterado — fronteiras arquiteturais preservadas.

## 12. Decisões tomadas durante a implementação

Decisões de escopo/interpretação resolvidas autonomamente (nenhuma
contradiz a arquitetura documentada; registradas aqui para transparência):

1. **Geografia sintética em vez da carga oficial completa de 645
   municípios** — ver seção 10. Resolvido pela própria regra do CLAUDE.md
   ("nunca invente dados... fontes oficiais"), não uma decisão arbitrária.
2. **`RiskConfigComponente` deixada vazia** (nenhum peso semeado), mesmo a
   estrutura existindo — instrução explícita "não defina pesos arbitrários"
   levada ao pé da letra.
3. **`IndicadorMunicipal`/`IndicadorDefinicao`/`Estabelecimento`/
   `QualidadeCheck` não populadas pelo seed** — não estavam na lista
   explícita de itens a validar pelo seed desta fase; tabelas existem e
   estão migradas, só não têm dados.
4. **Limiar de supressão não acoplado a `RiskConfig`** — uma ideia levantada
   na análise conceitual anterior desta sessão, mas não reafirmada nas
   instruções desta rodada; manter os dois conceitos (supressão de fatos
   brutos vs. metodologia do Radar) desacoplados evita uma dependência de
   ordem estranha entre Fase 1 e Fase 2.
5. **Suite de testes como testes de integração contra o banco de
   desenvolvimento já seedado**, não um banco de teste isolado — proporcional
   ao escopo da Fase 1 (validar schema + seed, não CI/performance).

## 13. O que NÃO foi implementado

Pertence explicitamente às próximas fases:

- **Fase 2** — motor de cálculo do Radar (`packages/risk`), pesos,
  normalização por percentil, classificação, confiabilidade,
  materialização de `RiskComponenteValor`/`RiskScore`.
- **Fase 3** — endpoints da API analítica, envelope de proveniência
  servido via HTTP, reaplicação de supressão sobre agregações/filtros
  combinados, paginação, políticas de acesso.
- **Fase 4** — dashboard, mapa de calor, qualquer UI além da página de
  status já existente da Fase 0.
- **Fase 5** — ingestão real (SIH/SUS, CNES, IBGE), ETL Python, carga
  geográfica oficial completa, validação das taxonomias provisórias.
- **Fase 6** — autenticação, RBAC funcional (tabelas existem, inertes),
  trilha de auditoria funcionando (`AuditLog` existe, não é escrita).
- **Fase 7** — projeção estatística, calibração de pesos.

## 14. Próximo passo

A Fase 2 (motor do Radar de Risco) está pronta para ser iniciada — a
estrutura de dados que ela consome (`FatoInternacaoResidencia`,
`FatoInternacaoLocal`, `FatoCapacidadeLeitos`, `Populacao`, `RiskConfig`,
`RiskConfigComponente`) existe, está migrada e populada com dados DEMO
suficientes para testar o motor. Esta implementação não avança para a
Fase 2 — aguardando autorização.
