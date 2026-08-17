# `sp-municipios.geojson`

Limites territoriais dos 645 municípios de São Paulo.

- **Fonte**: IBGE — API de Malhas Territoriais (`GET /api/v3/malhas/estados/35`).
  Documentação: <https://servicodados.ibge.gov.br/api/docs/malhas>
- **Órgão responsável**: Instituto Brasileiro de Geografia e Estatística (IBGE).
- **Licença**: dado público do governo brasileiro, sujeito à Lei de Acesso
  à Informação (Lei nº 12.527/2011). Sem restrição de redistribuição
  conhecida.
- **Qualidade**: `minima` (simplificação geométrica reduzida — apropriada
  para um mapa coroplético pequeno; a qualidade `maxima` produz um arquivo
  várias vezes maior sem ganho perceptível neste uso).
- **Sistema de coordenadas**: WGS84 (EPSG:4326), padrão GeoJSON (RFC 7946).
- **Chave de relacionamento**: `features[].properties.codarea` — código
  IBGE de 7 dígitos, a mesma chave de `Municipio.codigoIbge7` no banco de
  dados (`packages/db/prisma/schema.prisma`). **Nunca relacionar por nome**
  — o código é a chave preferencial (evita ambiguidade com municípios
  homônimos entre estados e variações de grafia).
- **Cobertura confirmada**: 645 features, uma por município — igual ao
  total oficial de municípios de SP retornado pela API de Localidades do
  IBGE na mesma sessão de ingestão (`etl/ingest_geografia.py`).
- **Tamanho**: ~275 KB (minificado, sem indentação).
- **Atualização**: este arquivo é gerado uma vez e versionado (não buscado
  em tempo de execução pelo frontend) — para atualizar, rode novamente o
  trecho de `etl/healthmap_etl/sources/ibge.py::buscar_malha_municipios_sp`
  que o gerou (ver `docs/fase-5-relatorio.md`).

## Por que não Leaflet/tiles?

O produto não precisa de pan/zoom em tiles de rua — é um mapa coroplético
estático do estado de SP. `components/charts/map.tsx` (`apps/web`) desenha
este GeoJSON diretamente em SVG com uma projeção equiretangular simples,
mesma filosofia do gráfico de série temporal (`components/charts/line-chart.tsx`):
sem dependência nova.
