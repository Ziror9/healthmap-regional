# etl/

Diretorio reservado aos pipelines Python de ingestao, validacao, transformacao e
agregacao dos dados publicos.

## Estado atual (Fase 0)

Vazio de proposito. Nenhuma ingestao implementada, nenhuma dependencia Python
declarada, nenhuma conexao com fonte externa.

## O que entra aqui (Fase 5)

```
etl/
├── healthmap_etl/
│   ├── sources/      # sih.py (pySUS), cnes.py, ibge.py
│   ├── validation/   # completude, dominio, consistencia, unicidade
│   ├── transform/    # recorte C00-C97, de-para de municipio, faixa etaria
│   ├── aggregate/    # bifurcacao residencia/internacao + supressao de celulas
│   ├── load/         # carga em silver/gold
│   └── lineage/      # registro de execucao, hash e contagens
└── tests/
```

## Regras que valem desde ja

1. A **agregacao e o ponto de anonimizacao**. Nenhum registro individual de
   internacao pode ser carregado no banco da aplicacao.
2. A camada Bronze (`data/bronze/`) e imutavel e nunca versionada no Git.
3. Toda execucao registra origem, competencia, hash do arquivo e contagens.
4. O ETL entrega **insumos** do Radar de Risco. Ele nao calcula o indice: isso e
   responsabilidade exclusiva de `packages/risk`.
5. Residencia e internacao sao agregadas em tabelas separadas.
