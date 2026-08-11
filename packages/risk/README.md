# @healthmap/risk

Implementacao unica do **Radar de Risco Regional**.

## Estado atual (Fase 0)

Nenhum algoritmo implementado. O package existe para fixar a fronteira
arquitetural antes que o codigo apareca.

## O que entra aqui (Fase 2)

- normalizacao dos componentes por percentil dentro da coorte;
- composicao ponderada a partir de `RiskConfig` (pesos configuraveis e versionados);
- classificacao em faixas;
- calculo de confiabilidade por volume;
- tratamento de componente ausente (renormalizacao dos pesos disponiveis).

## O que NAO entra aqui

- acesso a banco (isso e `@healthmap/db`);
- regras de HTTP (isso e `apps/api`);
- formatacao para exibicao (isso e `apps/web`).

O modulo deve ser puro e testavel: entra um conjunto de insumos, sai um indice.

Metodologia: [`docs/risk-methodology.md`](../../docs/risk-methodology.md)
