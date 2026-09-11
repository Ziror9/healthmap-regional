# Fase 5.11 - Fluxo Assistencial (mapa de arcos)

Etapa E5 do redesign, registrada como fase propria porque e **alteracao
funcional**: pagina e interacoes novas sobre dados que ja existiam desde a
Fase 5.8. Nenhuma alteracao de dados ou de metodologia.

---

## 1. Classificacao das alteracoes

| Categoria                   | O que entrou                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Redesign visual**         | camada de arcos e de polos sobre o `MapaSP`; link "Mapa de fluxo" no card de polos da Visao Geral             |
| **Alteracao funcional**     | pagina `/fluxo`; item de navegacao; modos origem/destino; Top N; busca; estado na URL; link na ficha do municipio |
| **Dados / metodologia**     | **nenhuma** - nenhum endpoint, query, migration, fato, RiskScore, RiskConfig, peso ou threshold alterado      |

A unica mudanca de contrato interno e a prop `overlay` do `MapaSP`, de
`ReactNode` para funcao. A prop nao tinha nenhum consumidor (estava inerte
desde a E2), entao nada que existia mudou de comportamento.

---

## 2. O que foi entregue

Tudo o que a aprovacao pediu, sobre os endpoints existentes:

| Pedido                          | Como                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| selecao de municipio            | clique no mapa, busca por nome (sem acento/caixa), clique em qualquer item de ranking                                  |
| visualizacao dos destinos       | modo **"Para onde vao"** (`saidas` de `/api/fluxo/municipios/:id`)                                                     |
| visualizacao por polos          | visao de entrada, sem municipio: discos de area proporcional e ranking (`/api/fluxo/polos`, limite 50)                 |
| Top N fluxos                    | 5 / 10 (padrao) / 20 / todos - recorta mapa e ranking juntos                                                           |
| mapa com arcos                  | `components/charts/fluxo-layer.tsx`, sobre os centroides da propria malha do `MapaSP`                                  |
| interacao origem -> destino     | no modo origem, clicar num destino abre o modo **"De onde vem"** daquele destino                                       |
| interacao destino -> origem     | no modo destino, clicar numa origem abre o modo **"Para onde vao"** daquela origem                                     |

Alem disso: estado na URL (`municipio`, `modo`, `top`, `ano`), com os valores
padrao fora da URL e fallback para valor invalido; destaque cruzado (passar o
mouse no ranking realca o arco e recua os demais); pares suprimidos listados
a parte, por nome, sem valor; link "Ver no mapa de fluxo" na ficha do
municipio e "Mapa de fluxo" na Visao Geral.

---

## 3. Arquivos

**Novos**

| Arquivo                                        | Papel                                                                                   |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| `apps/web/app/fluxo/page.tsx`                  | pagina, estados de carregamento/erro/vazio/suprimido, painel lateral                    |
| `apps/web/components/charts/fluxo-layer.tsx`   | `CamadaFluxo` (arcos, pontos, rotulos) e `CamadaPolos` (discos)                         |
| `apps/web/lib/fluxo-arcos.ts`                  | logica pura: URL -> filtros, Top N, espessura, curva, itens -> arcos, resumo do destino |
| `apps/web/lib/use-fluxo-filtros.ts`            | estado na URL (mesmo padrao do Radar Municipal, E4)                                     |
| `apps/web/lib/__tests__/fluxo-arcos.test.ts`   | 19 testes da logica pura                                                                |
| `docs/fase-5.11-relatorio.md`                  | este relatorio                                                                          |

**Alterados**

| Arquivo                                          | Mudanca                                                                            |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `apps/web/components/charts/map.tsx`             | `overlay` vira funcao que recebe `ContextoOverlay` (centroides, escala, zoom)      |
| `apps/web/lib/navigation.ts`                     | item "Fluxo Assistencial" no grupo Analise                                         |
| `apps/web/components/domain/fluxo-panel.tsx`     | link "Ver no mapa de fluxo"                                                        |
| `apps/web/app/page.tsx`                          | link "Mapa de fluxo" no card de polos                                              |
| `apps/web/package.json`, `package-lock.json`     | script `test` e `vitest` em devDependencies (mesma versao ja usada no monorepo)    |
| `apps/api/src/__tests__/fluxo.test.ts`           | 4 testes de invariantes entre endpoints                                            |
| `docs/roadmap.md`, `docs/known-limitations.md`, `docs/design-system.md`, `CLAUDE.md`, `README.md` | documentacao |

Nada em `packages/db`, `packages/risk`, `packages/contracts`, `apps/api/src`
(fora de testes) ou `etl/` foi tocado.

---

## 4. Decisoes

1. **`overlay` como funcao, nao segunda projecao.** Os arcos precisam dos
   centroides que so o `MapaSP` tem (malha projetada na E2). A alternativa -
   a pagina projetar o GeoJSON de novo - duplicaria a conta e, na primeira
   divergencia, o arco terminaria fora do poligono. A funcao recebe
   `centroideDe`, `unidadesPorPixel` (rotulo e ponto de tamanho fixo em
   qualquer zoom) e `zoom`.
2. **Par suprimido nunca vira arco nem entra em soma.** Qualquer espessura
   para um par suprimido inventaria uma magnitude. Ele aparece como contagem
   ("92 pares suprimidos nao desenhados") e como lista de nomes sem valor.
   Quando TODO o fluxo e suprimido, a pagina diz isso (`SuppressedBlock`), e
   nunca mostra "0".
3. **O proprio municipio nunca vira arco.** Atendimento na propria cidade nao
   e deslocamento; vai para o resumo ("Na propria cidade" / "Residentes
   locais").
4. **Grafite, nao cor.** Fluxo nao e risco. Pintar arcos com a rampa de risco
   faria o leitor ler gravidade onde ha deslocamento, e o vermelho
   institucional so marca o municipio selecionado (selecao). Magnitude tem um
   unico canal: a espessura.
5. **Espessura em escala de raiz quadrada**, em pixels de tela. Os destinos de
   um municipio vao de dezenas a milhares; na escala linear os pequenos
   sumiriam. A raiz preserva a ordem; o numero exato fica no ranking.
6. **Sem seta.** A curva sempre a esquerda do sentido origem -> destino da a
   direcao e separa A->B de B->A; o ponto fica na contraparte. Setas com traco
   que nao escala se deformam no zoom.
7. **"Recebidas de fora" no modo destino e soma de apresentacao.** O endpoint
   so traz resumo do lado origem. A pagina soma as `entradas` visiveis que a
   mesma resposta ja trouxe - o mesmo tipo de agregacao dos KPIs da Visao
   Geral. Um teste de API garante que essa soma e identica ao
   `internacoesRecebidasDeFora` de `/api/fluxo/polos`, calculado no servidor.
8. **Vitest em `apps/web`.** Primeiro teste automatizado do frontend. Mesma
   ferramenta e versao de `apps/api`, `packages/db` e `packages/risk` (ja
   instalada no monorepo); nenhuma dependencia nova de fato. Cobre so logica
   pura - sem jsdom, sem teste de componente.
9. **Top 10 como padrao.** Sao Paulo tem 21 destinos visiveis fora da cidade
   e Barretos recebe de 170 origens; desenhar tudo de saida vira um novelo.
   "Todos" continua a um clique.

---

## 5. Visao estadual - por que nao foi implementada, e o que ja esta pronto

A aprovacao pediu para parar e apresentar proposta caso a visao estadual se
mostrasse essencial. **Conclusao: nao e essencial para esta entrega.** A visao
de polos responde a pergunta estadual ("onde o estado concentra o
tratamento?") com o endpoint existente, e todos os fluxos de qualquer
municipio estao a um clique. Nenhum endpoint foi criado.

O que foi preparado para que ela seja um consumidor novo, e nao uma reescrita:

- `lib/fluxo-arcos.ts` trabalha com `ArcoFluxo { origem, destino, valor }`
  generico - nao sabe se veio de um municipio ou do estado;
- `CamadaFluxo` recebe arcos prontos e desenha; nao faz requisicao;
- as regras de supressao, Top N e espessura ja estao testadas nessa forma.

Se for pedida, bastaria um endpoint que devolva pares visiveis ja no formato
de arco e um seletor de modo "Estado" na pagina.

---

## 6. Validacao

### Numeros da pagina contra a API (2024)

| Caso                        | Pagina                                                                      | API / banco                  |
| --------------------------- | --------------------------------------------------------------------------- | ---------------------------- |
| Polos - top 5               | Sao Paulo 19.584, Jau 8.186, Ribeirao Preto 5.783, Barretos 4.908, Campinas 4.420 | identico (`/api/fluxo/polos`) |
| Jau, "De onde vem"          | 8.186 de 157 municipios; 1.582 residentes locais; 92 pares suprimidos       | identico                     |
| Sao Paulo, "Para onde vao"  | 21 destinos fora; 1.053 fora da cidade (2,4% do visivel, DERIVADO); 18 suprimidos | identico                |
| Adamantina, "Para onde vao" | Jau 124, Tupa 46, Marilia 32; 202 fora (86,3%); 8 suprimidos                | identico                     |
| Pracinha (todo suprimido)   | "Todo o fluxo de saida esta suprimido: 5 pares"; nenhum arco; nenhum "0"    | 5 pares, todos suprimidos    |
| Adolfo, "De onde vem"       | "Nenhuma internacao registrada... ausencia de dado, nao valor suprimido"   | nenhuma entrada              |

### Interacao e estado

- URL `?municipio=abc&top=7&modo=xyz&ano=1999`: filtros invalidos cairam no
  padrao; `ano=1999` recebeu 404 `ANO_NAO_DISPONIVEL`, foi descartado da URL
  e a pagina carregou 2024.
- Cadeia de interacao percorrida no navegador: clique no polo **Barretos** ->
  "De onde vem" (`?municipio=78&modo=destino`: 4.908 de 170 municipios, 204
  suprimidos, 10 arcos) -> alternar para "Para onde vao" (`?municipio=78`:
  1 destino fora, Ribeirao Preto 10, 3 suprimidos, 1 arco) -> clique em
  Ribeirao Preto no ranking -> "De onde vem" de Ribeirao Preto
  (`?municipio=503&modo=destino`: 5.783 de 83, 96 suprimidos). Todos os
  numeros identicos a API.
- Console sem erros alem do 404 esperado do teste acima.
- Mobile (375 x 812): sem rolagem horizontal, mapa com 341px de largura e os
  10 arcos, filtros recolhidos no `Sheet`, painel abaixo do mapa.

### Integridade

Checksum do RiskScore REAL antes e depois: **7.740 linhas,
`795de04de0a361231635c8532c53e510`** - identico.

---

## 7. Testes

| Escopo                  | Resultado                                           |
| ----------------------- | --------------------------------------------------- |
| typecheck (monorepo)    | limpo                                               |
| lint (monorepo)         | limpo                                               |
| build de producao (web) | limpo - `/fluxo` estatica, 9,14 kB                  |
| Web (novo)              | **19/19**                                           |
| API                     | **64/64** (60 anteriores + 4 novos da Fase 5.11)    |
| DB                      | 132/132                                             |
| Risk                    | 43/43                                               |
| ETL                     | nao executado - nenhum arquivo Python alterado      |

Os 4 testes novos de API fixam o que a pagina assume:

1. para cada polo, a soma das entradas visiveis de fora e a contagem de
   origens batem com `/api/fluxo/polos`;
2. o resumo de saida conta exatamente os pares visiveis e suprimidos da lista;
3. origem com todo o fluxo suprimido: volume visivel 0 e taxa derivada `null`;
4. municipio que nao recebe ninguem devolve `entradas: []`, nao erro.

---

## 8. Problemas e limitacoes

- **Rotulos nao evitam colisao.** Vizinhos proximos (Barra Bonita e Lencois
  Paulista, ao lado de Jau) podem sobrepor; o zoom separa e o ranking e a
  leitura exata. Algoritmo de colisao ficou fora por prazo.
- **`unidadesPorPixel` e lido na renderizacao.** Ao redimensionar a janela sem
  outra interacao, o rotulo pode ficar ligeiramente maior ou menor ate a
  proxima renderizacao (qualquer hover corrige).
- **Arcos ligam centroides**, nao hospitais - indicam o par de municipios,
  nao a rota.
- Registradas em `docs/known-limitations.md` #9.

---

## 9. Proxima etapa

E6 - pagina de Regioes de Saude consumindo `RiskScoreRegional`
(`/api/risk/regioes`), distinta do Radar Municipal.
