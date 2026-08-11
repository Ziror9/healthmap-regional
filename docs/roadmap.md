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

## Fase 1 - Banco + DEMO

**Objetivo.** Materializar o modelo de dominio e uma base DEMO claramente
identificada.

**Entregas.** Schema Prisma completo (dimensoes, fatos por eixo territorial,
camada de risco, governanca); migrations; schemas `silver`/`gold`/`meta`;
repositorios; referencia geografica real (645 municipios de SP e regioes de
saude); gerador DEMO deterministico de ate 5 anos de competencias; entidades de
RBAC criadas e inertes.

**Dependencias.** Fase 0. Definicoes pendentes: agrupamento de CID dentro de
C00-C97; limiar de supressao de celulas.

**Criterio de conclusao.** Banco populado e consultavel, com `origem` e
linhagem em toda linha de fato; nenhuma entidade capaz de armazenar dado
individual de paciente.

---

## Fase 2 - Radar de Risco

**Objetivo.** Implementar o motor unico do indice.

**Entregas.** `packages/risk` com normalizacao por percentil, composicao
ponderada, classificacao, confiabilidade por volume e tratamento de componente
ausente; `RiskConfig` v0.1 semeada como **nao oficial**; materializacao de
`RiskComponenteValor` e `RiskScore`; testes unitarios incluindo casos-limite;
`docs/risk-methodology.md` atualizado com a formula efetiva.

**Dependencias.** Fase 1. Definicoes pendentes: faixas de classificacao; limiar
de volume minimo para confiabilidade alta.

**Criterio de conclusao.** Indice reproduzivel, versionado e auditavel sobre a
base DEMO; recalculo com pesos novos cria linhas novas, nunca sobrescreve.

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
