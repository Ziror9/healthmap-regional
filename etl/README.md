# etl/

Pipelines Python de ingestao REAL: leem fontes publicas (IBGE, SES-SP,
CNES/DEMAS), validam qualidade e escrevem direto no PostgreSQL via SQL
(ADR-001 #6 - "Python escreve no banco, TypeScript le"; nao passa por
`packages/db`).

## Estado atual (Fase 5)

Implementado: geografia (IBGE + DRS-SP), CNES (capacidade de leitos +
amostra de estabelecimentos) e SIH/SUS (internacoes oncologicas REAL, POC
de 1 competencia - ver `docs/sih-methodology.md`).

```
etl/
├── healthmap_etl/
│   ├── sources/          # ibge.py, drs_sp.py, cnes.py, sih.py
│   ├── db.py              # conexao Postgres (le DATABASE_URL do .env raiz)
│   ├── lineage.py          # FonteDados/IngestaoExecucao/QualidadeCheck
│   ├── quality.py          # checks reutilizaveis (BLOQUEANTE/ALERTA)
│   └── sih_transform.py    # transformacao SIH-RD pura (sem pandas/pysus)
├── reference-data/        # drs_sp_ibge.csv (referencia local, ver README proprio)
├── docker/                 # Dockerfile.sih - so a ingestao SIH roda em container (ver abaixo)
├── ingest_geografia.py    # 645 municipios + 17 DRS reais
├── ingest_cnes.py         # capacidade de leitos + amostra de estabelecimentos
├── ingest_sih.py          # internacoes oncologicas REAL (so roda via Docker)
├── requirements.txt
└── tests/                 # pytest, so funcoes puras (sem rede/banco)
```

**Geografia e CNES** rodam no Python principal do host:
`pip install -r etl/requirements.txt`, depois
`python etl/ingest_geografia.py` e `python etl/ingest_cnes.py` a partir da
raiz do repositorio.

**SIH so roda dentro de um container Linux** (`etl/docker/Dockerfile.sih`)
- `pysus` depende de uma extensao C (`pyreaddbc`) sem wheel para Windows,
so para Linux (confirmado nesta sessao). Nao altera o `docker-compose.yml`
do projeto (que continua exclusivo de PostgreSQL+Adminer):

```bash
docker build -f etl/docker/Dockerfile.sih -t healthmap-etl-sih .
docker run --rm -e DATABASE_URL="postgresql://healthmap:<senha do .env>@host.docker.internal:5432/healthmap?schema=public" healthmap-etl-sih
```

(`host.docker.internal` no lugar de `localhost` - dentro do container,
`localhost` seria o proprio container, nao o Postgres do host.)

Testes: `python -m pytest etl/tests` (74 testes, todos sobre funcoes puras
- inclui `sih_transform.py`, testavel sem pysus instalado).

## Regras que valem desde ja

1. A **agregacao e o ponto de anonimizacao**. Nenhum registro individual de
   internacao pode ser carregado no banco da aplicacao.
2. A camada Bronze (`data/bronze/`) e imutavel e nunca versionada no Git.
3. Toda execucao registra origem, competencia, hash do arquivo e contagens.
4. O ETL entrega **insumos** do Radar de Risco. Ele nao calcula o indice: isso e
   responsabilidade exclusiva de `packages/risk`.
5. Residencia e internacao sao agregadas em tabelas separadas.
