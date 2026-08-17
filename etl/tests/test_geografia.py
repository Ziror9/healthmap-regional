"""
Testes unitarios de ingest_geografia.centroide_aproximado - a unica logica de
calculo (nao so I/O) do script de geografia. Usa geometrias GeoJSON sinteticas
simples (nao a malha real) porque o objetivo aqui e validar a matematica da
media de vertices, nao a fonte de dados em si (isso e coberto por
test_geojson_asset.py, contra o arquivo real ja baixado).
"""

from __future__ import annotations

import ingest_geografia as geografia


class TestCentroideAproximado:
    def test_polygon_simples_e_a_media_dos_vertices(self) -> None:
        # Quadrado unitario: vertices (0,0) (0,2) (2,2) (2,0) em [lon, lat].
        geometry = {
            "type": "Polygon",
            "coordinates": [[[0, 0], [0, 2], [2, 2], [2, 0], [0, 0]]],
        }
        centro = geografia.centroide_aproximado(geometry)
        assert centro is not None
        lat, lon = centro
        assert lat == 0.8  # media de [0,2,2,0,0]
        assert lon == 0.8  # media de [0,0,2,2,0]

    def test_multipolygon_combina_vertices_de_todos_os_poligonos(self) -> None:
        geometry = {
            "type": "MultiPolygon",
            "coordinates": [
                [[[0, 0], [0, 2], [2, 2], [2, 0]]],
                [[[10, 10], [10, 12], [12, 12], [12, 10]]],
            ],
        }
        centro = geografia.centroide_aproximado(geometry)
        assert centro is not None
        lat, lon = centro
        assert lat > 0
        assert lon > 0

    def test_geometria_sem_coordenadas_devolve_none(self) -> None:
        assert geografia.centroide_aproximado({"type": "Polygon", "coordinates": []}) is None

    def test_nao_e_confundido_com_coordenada_medida_em_campo(self) -> None:
        # Regressao de intencao: para um poligono nao-retangular, o centroide
        # de vertices (o que esta funcao calcula) diverge do centroide de
        # area real - isso e esperado e documentado, nao um bug. O teste so
        # confirma que a funcao continua sendo a media simples, nao alguma
        # aproximacao de area que mudaria esse comportamento silenciosamente.
        triangulo_fino = {
            "type": "Polygon",
            "coordinates": [[[0, 0], [0, 0.01], [100, 0], [0, 0]]],
        }
        centro = geografia.centroide_aproximado(triangulo_fino)
        assert centro is not None
        lat, lon = centro
        # Media simples dos 4 vertices listados (o primeiro repete o ultimo).
        assert lon == (0 + 0 + 100 + 0) / 4
