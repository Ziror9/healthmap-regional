# Dados de referência (Fase 5)

Arquivos estáticos, checados no repositório, usados pelo ETL REAL. Diferente
da camada Bronze (`data/bronze/`, nunca versionada), estes são referências
pequenas e estáveis — versioná-las torna a ingestão reproduzível sem
depender da disponibilidade contínua da fonte original.

## `drs_sp_ibge.csv`

Mapeamento **código IBGE de 6 dígitos → Departamento Regional de Saúde
(DRS)** para os 645 municípios de São Paulo.

- **Fonte primária (códigos IBGE + número do DRS)**: Ministério da Saúde /
  Secretaria de Estado da Saúde de SP, "6ª Remessa — Distribuição de
  Equipamentos de Proteção Individual (EPI) por Município" (19/10/2020).
  URL:
  `https://www.saude.sp.gov.br/resources/ses/perfil/cidadao/homepage-new/outros-destaques/covid-19/6_remessa_19_10_20.pdf`
  Este é um relatório de distribuição de EPI durante a pandemia de
  COVID-19 — não é a finalidade original do documento, mas ele contém como
  anexo a tabela de referência território→DRS que a própria SES-SP usa
  internamente, com os 645 municípios e sem nenhuma lacuna.
- **Fonte de correção (nomes oficiais dos 17 DRS)**: página institucional
  da SES-SP, "Regionais de Saúde":
  `https://saude3.saude.sp.gov.br/departamentos-regionais-de-saude/regionais-de-saude/`
- **Extração**: `pdfplumber` sobre o texto bruto do PDF (não sobre
  `extract_tables()` — a detecção de tabela do PDF concatena, em algumas
  linhas, o nome do DRS com o nome da sub-região sem espaço entre eles,
  e trunca nomes longos em ~29 caracteres em certas colunas). A extração
  usada aqui depende só do padrão `<código 6 dígitos> DRS <NN> -`, que
  aparece intacto em 100% das 645 linhas — o nome de cada DRS vem da
  página institucional (fonte de correção acima), não do texto truncado
  do PDF de EPI.
- **Validado**: 645 códigos únicos, os 17 números de DRS (01–17) presentes,
  soma das contagens por DRS = 645, nomes conferidos contra a página
  oficial.
- **Uso**: apenas o nível "DRS" existe no schema (`RegiaoSaude`) — a
  granularidade mais fina de "Região de Saúde" dentro de cada DRS que a
  tabela também contém não é usada (não existe campo equivalente no
  modelo de dados) e foi descartada da extração.
- **Licença**: dado público do governo brasileiro, sujeito à Lei de
  Acesso à Informação (Lei nº 12.527/2011). Nenhum termo de uso restritivo
  encontrado.

## Por que não IBGE?

O IBGE não modela "Região de Saúde"/DRS — essa é uma divisão
administrativa definida pela Secretaria de Estado da Saúde de SP
(Decreto Estadual nº 51.433/2006), distinta da divisão geográfica do IBGE
(microrregião/mesorregião). Por isso a geografia (município, coordenadas,
malha) vem do IBGE, e o agrupamento em DRS vem da SES-SP.
