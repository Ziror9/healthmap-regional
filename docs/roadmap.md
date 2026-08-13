# Roadmap - HealthMap Regional

Cada fase e autonoma, testavel e nao inicia sem aprovacao explicita. Nenhuma
fase comeca antes que a anterior atenda seu criterio de conclusao.

---

## Fase 0 - Fundacao `CONCLUIDA`

**Objetivo.** Preparar uma fundacao limpa, documentada e pronta para
desenvolvimento, sem nenhuma funcionalidade de negocio.

**Entregas.** Monorepo com npm workspaces; TypeScript strict compartilhado;
ESLint e Prettier; Docker Compose com PostgreSQL 16 e Adminer; Prisma conectado;
frontend Next.js com pagina de status; API com `/health` e `/health/ready`;
documentacao inicial; `CLAUDE.md`; ADR-001.

**Dependencias.** Nenhuma.

**Criterio de conclusao.** Docker sobe, PostgreSQL responde, Adminer conecta,
Prisma conecta, frontend e API iniciam, `/health` responde, TypeScript sem erros,
ESLint executa, build do frontend funciona, nenhum segredo versionado.

---

## Fase 1 - Banco + DEMO `CONCLUIDA`

**Objetivo.** Materializar o modelo de dominio e uma base DEMO claramente
identificada.

**Entregas.** Schema Prisma completo (dimensoes, fatos por eixo territorial,
camada de risco estrutural, governanca) nos schemas `silver`/`gold`/`meta`;
migration aplicada com CHECK constraints e indice unico parcial customizados;
gerador DEMO deterministico (`npm run db:seed`) cobrindo 15 municipios
ilustrativos de SP, 6 competencias, populacao, internacoes por residencia e
por local, capacidade de leitos, com supressao n<5 aplicada; entidades de
RBAC criadas e inertes. Detalhes completos em
[`docs/fase-1-relatorio.md`](fase-1-relatorio.md).

**Dependencias.** Fase 0.

**Definicoes resolvidas nesta fase:**
- agrupamento de CID dentro de C00-C97: uma unica linha no MVP
  (`TODAS_NEOPLASIAS_MALIGNAS`), campo `agrupamento` pronto para subdivisao
  futura por topografia;
- limiar de supressao de celulas: `n < 5`, tratado como parametro do gerador/
  ETL (nao embutido em codigo sem documentacao), sujeito a revisao
  metodologica/juridica - ver `docs/known-limitations.md`.

**Definicoes ainda pendentes (nao bloqueiam a Fase 1, ver known-limitations.md):**
- granularidade real de `FaixaEtaria` (decenal usado como taxonomia inicial)
  e de `TipoLeito` (taxonomia simplificada) contra o padrao real do SIH/CNES;
- base geografica completa e oficial (645 municipios de SP) - a Fase 1 usa um
  subconjunto pequeno com codigos IBGE sinteticos, nao a carga oficial
  completa (ver known-limitations.md).

**Criterio de conclusao.** Banco populado e consultavel, com `origem` e
linhagem em toda linha de fato; nenhuma entidade capaz de armazenar dado
individual de paciente. Atingido - ver `docs/fase-1-relatorio.md` para as
validacoes executadas.

---

## Fase 2 - Radar de Risco `CONCLUIDA (parcial - ver limitacoes)`

**Objetivo.** Implementar o motor unico do indice.

**Entregas.** `packages/risk` com normalizacao por percentil, composicao
ponderada com renormalizacao de componente ausente, classificacao por
quintil (provisoria), confiabilidade por volume; duas `RiskConfig` DEMO
semeadas como **nao oficiais** (pesos iguais, `limiarVolumeMinimo`
diferente); materializacao de `RiskComponenteValor` e `RiskScore` sobre a
base DEMO da Fase 1; 43 testes unitarios (packages/risk) + 16 testes de
integracao (packages/db) incluindo casos-limite; `docs/risk-methodology.md`
atualizado marcando o que foi implementado e o que continua em aberto.
Detalhes: [`docs/fase-2-relatorio.md`](fase-2-relatorio.md).

**Dependencias.** Fase 1.

**Definicoes que continuam pendentes** (o motor funciona sem elas, mas 2 dos
4 componentes ficam estruturalmente prontos e sempre indisponiveis por
causa delas - ver `docs/known-limitations.md`):
- janela movel e tratamento de sazonalidade de TENDENCIA;
- formula/pesos de composicao dos 3 sub-indicadores de SEVERIDADE;
- confirmacao do metodo de classificacao (quintis relativos, implementado
  como provisorio, vs. cortes absolutos fixos);
- segundo limiar de confiabilidade para distinguir ALTA de MEDIA;
- fonte do indicador de VULNERABILIDADE (sem mudanca desde a Fase 0/1).

**Criterio de conclusao.** Indice reproduzivel, versionado e auditavel sobre a
base DEMO; recalculo com pesos novos cria linhas novas, nunca sobrescreve.
Atingido para o(s) componente(s) metodologicamente completos
(PRESSAO_HOSPITALAR_ESTIMADA) - determinismo e idempotencia comprovados por
teste automatizado. Os demais componentes nao violam o criterio: ficam
honestamente indisponiveis em vez de produzir um numero inventado.

---

## Fase 3 - API

**Objetivo.** Expor os dados analiticos com proveniencia obrigatoria.

**Entregas.** Endpoints de KPIs, mapa, ranking, serie temporal, detalhe
municipal, metodologia e configuracoes de risco; envelope de proveniencia em
todas as respostas; validacao de entrada; paginacao; tratamento de erros;
camada `policies` com politica permissiva substituivel; reaplicacao da supressao
sobre filtros combinados; documentacao da API.

**Dependencias.** Fases 1 e 2. Definicao pendente: semantica operacional dos
KPIs de cabecalho.

**Criterio de conclusao.** API tipada, testada e documentada; nenhum endpoint
retorna valor sem `meta`.

---

## Fase 4 - Dashboard

**Objetivo.** Produto navegavel de ponta a ponta sobre dados DEMO.

**Entregas.** Layout do produto; KPIs; mapa de calor (Leaflet + GeoJSON de SP);
Radar de Risco; serie temporal; ranking com drill-down; pagina de municipio;
pagina de metodologia; filtros globais; design system de proveniencia (marcador
DEMO, selo de estimativa, barra de frescor, marcacao de baixa confiabilidade);
escala de risco legivel sem depender apenas de cor.

**Dependencias.** Fase 3. Definicao pendente: origem e simplificacao do GeoJSON.

**Criterio de conclusao.** Fluxo completo navegavel; projecao e estimativa nunca
renderizadas com o mesmo tratamento visual de dado observado.

---

## Fase 5 - Dados reais

**Objetivo.** Substituir gradualmente DEMO por REAL.

**Entregas.** `etl/` com ingestao via pySUS (SIH/SP), CNES e IBGE; validacao de
qualidade bloqueante e nao bloqueante; bifurcacao residencia/internacao;
supressao de celulas; carga; registro de linhagem; reprocessamento das ultimas
competencias; definicao do indicador de vulnerabilidade e ativacao do quarto
componente do Radar.

**Dependencias.** Fases 1 a 4. Definicao pendente: fonte e indicador de
vulnerabilidade social.

**Criterio de conclusao.** Primeira competencia REAL carregada e visivel, com
defasagem declarada na interface e convivendo com DEMO sem mistura silenciosa.

---

## Fase 6 - Seguranca + Governanca

**Objetivo.** Tornar o MVP operavel com controle de acesso e rastreabilidade.

**Entregas.** Autenticacao; RBAC efetivo com escopo territorial (substituindo a
politica permissiva); trilha de auditoria de consulta e exportacao; hardening da
API; politica de retencao e descarte; Dockerfiles dos demais servicos; deploy.

**Dependencias.** Fase 5. Definicoes pendentes: regra de disparo dos alertas de
capacidade; ambiente de hospedagem.

**Criterio de conclusao.** Nenhum acesso anonimo a dados; toda consulta e
exportacao registradas.

---

## Fase 7 - Analitica avancada + OCI

**Objetivo.** Preparar a solucao para piloto real.

**Entregas.** Projecao por metodo estatistico simples e auditavel, rotulada como
PROJECAO com intervalo de incerteza; calibracao dos pesos e eventual promocao de
`RiskConfig` a oficial; metricas de vies por subgrupo; observabilidade;
agregacao por Regiao de Saude; plano de migracao para OCI; avaliacao do
Select AI.

**Dependencias.** Fase 6. Definicao pendente: metodo de projecao.

**Criterio de conclusao.** Projecoes auditaveis e documentadas; nenhum modelo
complexo de machine learning introduzido sem validacao previa.
