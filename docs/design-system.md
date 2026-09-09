# Design System - HealthMap Regional

> Documento do que **está implementado** (etapas E1-E3 do redesign), não de uma
> especificação futura. Toda regra aqui tem código correspondente em
> `apps/web`. O que ainda não existe está marcado como pendente, não descrito
> como se existisse.
>
> Fonte da verdade dos valores: `apps/web/app/globals.css` (tokens) e
> `apps/web/tailwind.config.ts` (classes). Este documento explica **por quê**;
> o código diz **quanto**.

---

## 1. Identidade

### Princípio único

> **Cor é dado. Neutro é estrutura.**

Todo o resto decorre disso. A interface é um instrumento de leitura de dados de
saúde pública, não um painel decorativo: a cor que o olho persegue precisa ser
sempre a de um valor, nunca a de um botão, uma borda ou uma marca.

### Inspiração

A referência é a **linguagem de produto enterprise da Oracle** — não o site
institucional dela. O que foi tomado emprestado:

- vermelho institucional como acento de identidade, usado com parcimônia;
- neutros grafite e alto contraste tipográfico;
- densidade controlada, régua rígida, bastante espaço negativo;
- componentes discretos, bordas sutis, ícones minimalistas.

### Identidade própria do HealthMap

O que diferencia este produto de qualquer outro dashboard não é a paleta: é
**dizer o que não se sabe**. Um valor suprimido, um componente sem metodologia
definida e um indicador com 4 de 12 competências não são falhas a esconder —
são a prova de que os números afirmados podem ser levados a sério. O design
existe para **amplificar** essa honestidade, nunca para maquiá-la.

Consequência prática, e é uma regra de aceitação: **design não pode mascarar
ausência de dado.** Se existe dado, apresente bem; se está suprimido, diga; se
não existe, mostre indisponibilidade; se a funcionalidade não existe, não a
simule.

---

## 2. Cores

Todos os tokens são HSL sem `hsl()`, consumidos como `hsl(var(--token))` pelo
Tailwind. Trocar a paleta inteira é editar um arquivo só.

### 2.1 Institucional

| Token | Valor | Uso permitido | Uso proibido |
| --- | --- | --- | --- |
| `--primary` | `5 74% 40%` | Marca, ação primária, item ativo de navegação, anel de foco, contorno de seleção | **Qualquer valor de dado.** Nunca é a cor de "Crítico" |
| `--primary-hover` | `5 75% 32%` | Estado pressionado/hover da ação primária | — |
| `--accent` | `18 14% 20%` | Destaque neutro-escuro que não é ação | Fundo de área grande |

O vermelho institucional e o vermelho de gravidade coexistem na mesma tela (um
botão e um município crítico). Eles são distinguíveis porque ocupam **papéis
diferentes e consistentes**: se o vermelho está numa borda de navegação ou num
controle, é marca; se está preenchendo território ou um chip de classificação,
é dado.

### 2.2 Neutros

Grafite com viés quente — um cinza puro lê como não-escolhido.

| Token | Valor | Papel |
| --- | --- | --- |
| `--background` | `20 27% 98%` | Fundo da aplicação |
| `--surface` | `0 0% 100%` | Superfície elevada (painel, cartão, tabela) |
| `--surface-muted` | `24 18% 95%` | Fundo secundário, cabeçalho de tabela, barra de ranking |
| `--foreground` | `18 20% 7%` | Texto principal |
| `--muted-foreground` | `15 8% 39%` | Texto secundário e legenda (AA sobre branco) |
| `--border` | `20 14% 88%` | Régua e borda padrão |
| `--border-strong` | `20 12% 80%` | Borda de controle interativo (botão outline, select em hover) |

### 2.3 Semânticas — estado, nunca magnitude

| Token | Valor | Significado |
| --- | --- | --- |
| `--success` | `158 57% 27%` | Situação favorável, alta confiabilidade |
| `--warning` | `35 81% 36%` | Atenção; origem DEMO; natureza ESTIMATIVA |
| `--danger` | `4 69% 35%` | Erro, baixa confiabilidade |
| `--info` | `205 64% 33%` | Informação, natureza PROJEÇÃO |

Verde **não aparece na escala de risco**. Risco é uma grandeza ordenada, não
uma dualidade bom/ruim — verde fica reservado a estado, onde de fato significa
"favorável".

### 2.4 Rampa de risco — exclusiva de dado

Cinco degraus de luminância decrescente, matiz contínuo do palha ao vermelho
profundo:

| Nível | `--risk-N` | Luminância | Classificação correspondente |
| --- | --- | --- | --- |
| 1 | `37 83% 88%` | 88% | Muito baixo |
| 2 | `34 77% 75%` | 75% | Baixo |
| 3 | `28 68% 60%` | 60% | Médio |
| 4 | `21 59% 47%` | 47% | Alto |
| 5 | `10 71% 33%` | 33% | Crítico |

Cada nível tem quatro variantes: `--risk-N` (preenchimento de área — mapa,
swatch), `--risk-N-ink` (texto e ícone), `--risk-N-bg` e `--risk-N-line` (chips
pequenos, onde área cheia comprometeria a leitura do texto).

**Por que uma rampa sequencial.** A escala anterior era esmeralda → azul →
âmbar → laranja → vermelho: o matiz ciclava e a luminância subia e descia. O
mapa lia como confete e a ordem entre dois municípios não era perceptível. A
rampa atual varia **principalmente em luminância**, então a ordem sobrevive a
protanopia, deuteranopia e tritanopia — e continua legível em impressão
monocromática.

**Uso proibido:** navegação, botão, marca, borda estrutural. A rampa só pinta
valor.

### 2.5 Ausência — fora da rampa

| Token | Valor | Papel |
| --- | --- | --- |
| `--unavailable` | `17 7% 62%` | Texto/ícone de ausência |
| `--unavailable-bg` | `20 12% 94%` | Preenchimento de município sem dado no mapa |

Deliberadamente **fora** da escala: ausência não é um degrau, e jamais deve ser
lida como "valor baixo".

---

## 3. Risco: três coisas diferentes que usam vermelho

Esta seção existe porque confundi-las é o erro mais fácil de cometer neste
produto.

| | O que é | Onde aparece | Token |
| --- | --- | --- | --- |
| **Cor institucional** | Identidade e ação | Marca, botão primário, item ativo, foco, seleção no mapa | `--primary` |
| **Cor semântica** | Estado de um objeto | Confiabilidade, natureza, erro, origem DEMO | `--success` `--warning` `--danger` `--info` |
| **Escala ordinal de risco** | Posição numa grandeza de 5 níveis | Mapa, legenda, chip de classificação, distribuição regional | `--risk-1..5` |

### O que a rampa NÃO faz

Trocar a paleta foi **redesign visual puro**. A rampa de risco **não altera**:

- **thresholds** — os cortes continuam sendo os quintis da coorte calculados em
  `packages/risk/src/score.ts::classificarPorQuintil`;
- **classificação** — `CRITICO`/`ALTO`/`MEDIO`/`BAIXO`/`MUITO_BAIXO` continuam
  vindo prontos da API;
- **valores** — nenhum índice, taxa ou contagem é tocado;
- **metodologia** — nenhum peso, componente ou fórmula muda.

`apps/web/lib/risk-display.ts` é a camada única de apresentação: recebe uma
classificação já calculada e devolve rótulo, ícone, nível numérico e classes de
cor. **Não calcula nada** (CLAUDE.md, invariante 3).

### Nunca só cor

Toda comunicação de risco carrega redundância não-cromática:

- rótulo textual ("Crítico");
- nível numérico ("5/5");
- na legenda, a contagem de municípios por faixa;
- no mapa, `aria-label` e anúncio em `aria-live` do município em foco.

Se a cor for removida da tela, a informação de risco continua legível.

---

## 4. Ausência de dados — quatro estados

A distinção metodologicamente mais importante da interface. "Menos de 5 casos"
e "nenhum caso" levam a decisões de saúde pública diferentes; a interface não
pode empurrar as duas para o mesmo pixel.

| Estado | Significado | Tratamento |
| --- | --- | --- |
| **Zero real** | O valor medido é efetivamente zero | É um dado — aparece como número `0` |
| **Suprimido** | O valor existe e é > 0, mas é < 5 e não pode ser publicado (privacidade) | "Suprimido", com o motivo. **Nunca 0**, nunca estimado, nunca interpolado |
| **Sem registro** | Não há linha para este município/ano nesta fonte | "Sem registro" |
| **Sem metodologia** | O indicador existe estruturalmente, mas a metodologia nunca foi definida (Tendência, Severidade) | "Sem metodologia", com a lacuna nomeada |

Componente: `components/states/suppressed-value.tsx` — `SuppressedValue`
(inline, para célula de tabela e lista) e `SuppressedBlock` (bloco, quando há
espaço para o motivo por extenso).

**Estado de adoção (honesto):** o componente foi criado na E1 e a aplicação nas
telas é **progressiva**. Hoje convive com `components/domain/unavailable-note.tsx`
(`UnavailableNote`), que trata indisponibilidade de forma genérica e ainda é o
que aparece no detalhe de município e nos componentes do Radar. A substituição
acontece nas etapas E4-E7, tela a tela — não foi feita de uma vez para não
misturar troca de componente com redesign de página.

---

## 5. Tipografia

**A fonte é a pilha do sistema.** Decisão da Fase 4, mantida deliberadamente no
redesign: o build não deve depender de download externo em tempo de compilação.

```css
--font-sans: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, ...
--font-mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, ...
```

**Uma fonte dedicada está adiada, não descartada.** As opções em aberto são
`next/font/google` (baixa em tempo de build — contraria a decisão acima),
arquivos versionados em `public/fonts` (~200 KB no repositório) ou manter o
sistema. A escala tipográfica abaixo já está no lugar e funciona com qualquer
face: trocar é editar `--font-sans`.

### Escala

Nomeada por **papel**, somada (não substituta) à escala do Tailwind. O
diagnóstico do redesign registrou que quase toda a interface vivia entre 11px e
14px — amplitude insuficiente para hierarquia.

| Classe | Tamanho | Uso |
| --- | --- | --- |
| `text-label` | 11px, `+0.06em`, caixa alta | Rótulo, eyebrow, legenda de eixo |
| `text-caption` | 12px | Texto de apoio, motivo, nota de fonte |
| `text-body` | 14px | Corpo, célula de tabela, item de lista |
| `text-title-sm` | 15px | Título de bloco dentro de seção |
| `text-title` | 18px | Título de seção |
| `text-title-lg` | 22px | Título de página (mobile) |
| `text-display` | 28px | Título de página (desktop) |
| `text-figure` | 32px | Número de indicador |
| `text-figure-lg` | 40px | Número de destaque único |

### Números

`.tabular` (`font-variant-numeric: tabular-nums`) em **toda** coluna e todo
indicador, para alinhar dígitos sem recorrer a monoespaçada. A mono continua
sendo escolha deliberada onde o valor **é** um código (IBGE) ou onde a
comparação caractere a caractere importa.

---

## 6. Régua, forma e profundidade

- **Espaço** — 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64. Nada fora da escala.
- **Raio** — `--radius: 0.25rem` (4px). Menor lê como instrumento; maior lê
  como produto de consumo.
- **Sombra** — dois níveis apenas: `shadow-sm` em superfície elevada,
  `shadow-md` em overlay (drawer, tooltip, controles do mapa). **Cartão de
  conteúdo usa borda, não sombra** — sombra em todo bloco achata a hierarquia.
- **Nem tudo é cartão** — borda, preenchimento, raio e sombra cada um diz
  "objeto separado". Gastá-los em tudo achata a tela; são gastos por papel. O
  painel de indicadores da Visão Geral é o exemplo: quatro tiles dividem **um**
  bloco com réguas de 1px, em vez de quatro molduras idênticas.
- **Foco** — `:focus-visible` global em `globals.css`, anel de 2px na cor
  `--ring`. Antes cada componente declarava (ou esquecia) o seu.
- **Movimento** — `prefers-reduced-motion: reduce` zera animações e transições
  globalmente.

---

## 7. Componentes

### 7.1 Primitivos (`components/ui/`)

| Componente | Estado | Notas |
| --- | --- | --- |
| `Button` | Revisado E1 | Variantes `default`/`outline`/`ghost`/`link`; tamanhos `sm`/`default`/`icon`. Não declara foco — é global |
| `Card` | Revisado E1 | Borda, nunca sombra. `CardHeader`/`CardTitle`/`CardDescription`/`CardContent` |
| `Badge` | Existente | Variantes semânticas (`success`/`warning`/`danger`/`info`/`muted`/`outline`) |
| `Select` | Revisado E1 | Select nativo estilizado — Radix não está instalado |
| `Input` | **Novo E1** | Com ícone opcional. Criado porque a busca de `/municipios` era o único input com classes soltas |
| `Table` | Revisado E1 | **Cabeçalho fixo** (`sticky`) com `maxHeight`; scroll horizontal próprio |
| `Skeleton` | Revisado E1 | Bloco pulsante; a animação é desligada por `prefers-reduced-motion` |
| `Tooltip` | Existente | Só-CSS (`group-hover`/`group-focus-within`), sem JS e sem dependência |

### 7.2 Estados (`components/states/`)

| Componente | Estado | Notas |
| --- | --- | --- |
| `LoadingState` | Revisado E1 | Família de skeletons por `variant`: `block`, `map`, `table`, `cards`, `panel`. A API não mudou, então todas as telas ganharam skeleton sem edição. `label` virou anúncio `aria-live` |
| `EmptyState` | Revisado E1 | Ausência de resultado **para o filtro atual** — distinto de suprimido e de erro |
| `ErrorState` | Revisado E1 | `role="alert"`, com ação de nova tentativa opcional |
| `SuppressedValue` / `SuppressedBlock` | **Novo E1** | Os quatro estados da seção 4. Adoção progressiva (E4-E7) |

### 7.3 Layout e navegação (`components/layout/`)

| Componente | Estado | Notas |
| --- | --- | --- |
| `AppShell` | **Novo E1** | Client Component que concentra drawer, colapso da sidebar e rótulo de detalhe do breadcrumb. Expõe `useDetalheBreadcrumb` |
| `Topbar` | **Novo E1** | Trilha de navegação + gatilho do menu no mobile. Não repete o título da página |
| `Sidebar` | Revisado E1 | Colapsável 224/64px, preferência persistida em `localStorage`. Três grupos (Situação → Análise → Investigação), decisão de produto da Fase 5.8 |
| `PageHeader` | Revisado E1 | Título na escala nomeada; no mobile as ações rolam na horizontal em vez de empilhar |
| `PageContent` | Revisado E1 | Largura máxima 1180px |
| `SectionHeader` | Revisado E1 | Um nível abaixo do PageHeader |

Registro de navegação: `lib/navigation.ts` — fonte única consumida pela Sidebar
(lista) e pela Topbar (breadcrumb). Duplicar os rótulos faria as duas
divergirem na primeira renomeação.

### 7.4 Domínio (`components/domain/`)

| Componente | Estado | Notas |
| --- | --- | --- |
| `RiskBadge` | Revisado E1 | Swatch da rampa + rótulo + "n/5". O ícone por nível deu lugar ao swatch: o ícone era redundância contra daltonismo, papel que o nível numérico cumpre melhor; o swatch mostra a **posição na escala** |
| `RiskScaleLegend` | Revisado E2 | Monta as 5 faixas e delega o desenho a `EscalaLegenda` — uma implementação só. Aceita contagem por classificação |
| `ProvenanceBadge` | Existente | REAL/DEMO. DEMO em `warning`, para ser inconfundível; REAL discreto, por ser o padrão |
| `NatureBadge` / `ConfidenceBadge` | Revisados E1 | Natureza e confiabilidade em tokens semânticos |
| `KpiCard` + `PainelIndicadores` | Revisado E3 | Exige `fonte` e `periodo`. Os tiles dividem um bloco com réguas |
| `RankBar` | **Novo E3** | Linha de ranking com barra proporcional ao **maior** da lista (não a um total) |
| `RegionDistribuicao` | **Novo E3** | 17 DRS com barra empilhada pelos 5 níveis. Substituiu `RegionHeatGrid` (645 chips) |
| `FreshnessIndicator` | Existente | Competência + timestamp real de cálculo |
| `UnavailableNote` | Existente | Indisponibilidade genérica — em migração para `SuppressedValue` |
| `FilterBar` | Revisado E1 | Linha única com rolagem no mobile |
| `FluxoPanel`, `RiskScorePanel`, `StatusMetodologicoBadge` | Existentes | Não tocados pelo redesign até aqui |

---

## 8. Mapa

`components/charts/map.tsx` (`MapaSP`) — SVG puro, sem Leaflet e sem
dependência de tiles. É o **único** componente geográfico do produto.

### 8.1 Fonte geográfica

`apps/web/public/geo/sp-municipios.geojson` — IBGE, malha de qualidade
"mínima", 645 features, ~275 KB, versionado (não buscado em runtime).
Chave de junção: `feature.properties.codarea` = `Municipio.codigoIbge7`.
**Nunca por nome.** Ver `apps/web/public/geo/README.md`.

### 8.2 Projeção e proporção

`lib/geo-projection.ts` — módulo puro, sem React e sem DOM. Projeção
equirretangular (plate carrée) com paralelo padrão φ₀ = latitude média da
malha:

```
x' = λ · cos(φ₀)          y' = φ
s  = 1000 / Δx'           (UMA escala para os dois eixos)
px = (x' − x'min) · s
py = (y'max − φ) · s      (Y invertido: SVG cresce para baixo)
```

A altura do `viewBox` é **derivada** (`Δy' · s`), nunca imposta — resultado:
`1000 × 667,75`, razão **1,498**, idêntica à do território.

**O defeito corrigido na E2 (A1):** a versão anterior aplicava o `cos(φ₀)`
corretamente e, na linha seguinte, encaixava o resultado numa caixa quadrada
com escala independente por eixo (`sx = 640/Δx'`, `sy = 640/Δy'`). Como
`Δx'/Δy' = 1,498`, isso dava `sy/sx = 1,498`: o estado era desenhado **49,8%
mais alto** do que é, e a correção de longitude ficava integralmente anulada.

O módulo também calcula o **centroide de área** do maior anel de cada município
(fórmula do polígono, não média de vértices — que num litoral recortado cai
fora da figura). É usado pela navegação por teclado e será a âncora dos arcos do
mapa de fluxo.

### 8.3 Escala de cor

Rampa sequencial da seção 2.4. Duas listas explícitas, porque `fill-*` pinta SVG
e `bg-*` pinta bloco: `FAIXAS_COR` (mapa) e `FAIXAS_COR_SWATCH` (legenda), em
`lib/radar-municipal-color.ts`. Município sem dado recebe `--unavailable-bg`,
fora da rampa.

A escala de quantis do Radar Municipal particiona valores **já retornados pela
API** para escolher em qual dos 5 baldes visuais cada um cai. Não é metodologia
e não persiste nada.

### 8.4 Interação

- **Zoom/pan pelo `viewBox`** (`lib/use-map-viewport.ts`) — um atributo no
  elemento raiz. Zoom e pan não tocam nenhum dos 645 caminhos: não há
  reprojeção, não há recálculo de `d`, a árvore SVG não é reconciliada.
- Roda (com listener nativo não-passivo, porque o `onWheel` do React é passivo
  e não pode chamar `preventDefault`), arrasto, pinça de dois dedos via Pointer
  Events, botões +/−/enquadrar, atalhos `+` `−` `0`.
- Zoom ancorado no cursor. Limites 1×–12×. A janela é sempre reenquadrada
  **dentro** da extensão da malha — não há navegação infinita nem tela em
  branco.
- Atualização de estado **funcional** (`setVista(anterior => …)`): trackpad
  emite vários eventos de `wheel` no mesmo quadro, e ler o estado antes da
  re-renderização fazia a rajada inteira partir da mesma vista.
- Arrastar não dispara navegação.
- **Três estados visuais distintos:** hover (contorno fino), seleção (contorno
  grosso, `--primary`), foco de teclado (contorno tracejado).

### 8.5 Acessibilidade

- O mapa é **um** ponto de tabulação, não 645 — atravessar 645 paradas para
  sair do mapa seria pior que não ter teclado.
- Setas movem o foco **espacialmente** (município mais próximo naquela direção,
  pelos centroides). Numa ordem alfabética o foco saltaria pelo estado a cada
  tecla; num mapa, a direção **é** a informação.
- Enter/Espaço aciona o município em foco.
- `aria-live` anuncia o município focado com nome e valor.
- Tooltip próprio em HTML, preso às bordas do container — o `<title>` nativo do
  SVG saía da viewport e era invisível ao teclado.
- A legenda tem leitura textual completa em `sr-only`.

### 8.6 Performance

Medido na página real, com 645 municípios: 40 hovers em 24,9 ms; 10 passos de
zoom em 1,3 ms; contagem de nós de DOM idêntica antes e depois; o nó DOM da
camada preservado.

Três decisões sustentam isso:

1. a projeção roda **uma vez** por carga;
2. a camada dos polígonos é memoizada com comparação elemento a elemento das
   cores — hover, foco, seleção, zoom e pan não a reconciliam;
3. **um** ouvinte delegado no `<svg>` em vez de três por polígono (1.935
   closures a menos por renderização), lendo `data-codigo` do alvo.

`vector-effect="non-scaling-stroke"` mantém a borda em 0,6px em qualquer zoom.

### 8.7 Costura para o mapa de fluxo

`MapaSP` aceita `overlay?: ReactNode`, desenhado sobre os municípios **no mesmo
sistema de coordenadas**. É a costura prevista para os arcos da Fase 5.11: eles
usarão os centroides de `geo-projection.ts`, sem segunda implementação de
projeção. **Sem consumidor até a E5** — a prop existe e está inerte.

---

## 9. O que este documento não cobre

Porque ainda não existe:

- página de Fluxo Assistencial e mapa de arcos (E5 / Fase 5.11);
- página de Regiões de Saúde e interface do Radar Regional (E6);
- ficha de município em abas (E6);
- drawer de filtros e paginação de tabela (E4);
- tema escuro — os tokens de `.dark` não são aplicados;
- fonte dedicada (seção 5);
- testes automatizados de frontend — `apps/web` não tem framework de testes; a
  validação do redesign foi medição no DOM e verificação no navegador.
