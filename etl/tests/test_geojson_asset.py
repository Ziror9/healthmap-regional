"""
Testes do GeoJSON real ja baixado e commitado em
apps/web/public/geo/sp-municipios.geojson (secao 10 do pedido da Fase 5:
"valido, cobre os municipios esperados, codigos IBGE batem"). Le o arquivo do
disco - nao faz nenhuma chamada de rede (a fonte ja foi validada e salva por
ingest_geografia.py / healthmap_etl.sources.ibge ao gerar o asset).
"""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path

import pytest

_GEOJSON_PATH = Path(__file__).resolve().parents[2] / "apps" / "web" / "public" / "geo" / "sp-municipios.geojson"
_DRS_CSV_PATH = Path(__file__).resolve().parents[1] / "reference-data" / "drs_sp_ibge.csv"
_IBGE7_SP_RE = re.compile(r"^35\d{5}$")


@pytest.fixture(scope="module")
def geojson() -> dict:
    assert _GEOJSON_PATH.exists(), f"asset nao encontrado: {_GEOJSON_PATH}"
    with _GEOJSON_PATH.open(encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def codigos_drs_referencia() -> set[str]:
    with _DRS_CSV_PATH.open(encoding="utf-8") as f:
        return {linha["codigo_ibge6"] for linha in csv.DictReader(f)}


class TestEstruturaGeoJson:
    def test_e_uma_feature_collection(self, geojson: dict) -> None:
        assert geojson["type"] == "FeatureCollection"
        assert isinstance(geojson["features"], list)

    def test_toda_feature_tem_codarea_e_geometria(self, geojson: dict) -> None:
        for feature in geojson["features"]:
            assert "codarea" in feature["properties"]
            assert feature["geometry"]["type"] in ("Polygon", "MultiPolygon")
            assert feature["geometry"]["coordinates"]

    def test_todo_codarea_e_codigo_ibge7_valido_de_sp(self, geojson: dict) -> None:
        invalidos = [f["properties"]["codarea"] for f in geojson["features"] if not _IBGE7_SP_RE.match(f["properties"]["codarea"])]
        assert invalidos == []


class TestCoberturaDosMunicipios:
    def test_tem_exatamente_645_municipios(self, geojson: dict) -> None:
        assert len(geojson["features"]) == 645

    def test_nenhum_codarea_duplicado(self, geojson: dict) -> None:
        codigos = [f["properties"]["codarea"] for f in geojson["features"]]
        assert len(codigos) == len(set(codigos))

    def test_todos_os_municipios_da_referencia_drs_estao_cobertos(self, geojson: dict, codigos_drs_referencia: set[str]) -> None:
        # Chave de cruzamento e codigoIbge6 (a referencia DRS usa 6 digitos,
        # a malha usa 7 - o join real em ingest_geografia.py trunca [:6]).
        codigos6_malha = {f["properties"]["codarea"][:6] for f in geojson["features"]}
        faltando = codigos_drs_referencia - codigos6_malha
        assert faltando == set(), f"municipios da referencia DRS sem geometria na malha: {sorted(faltando)[:10]}"


class TestCoordenadas:
    def test_coordenadas_estao_em_wgs84_formato_lon_lat(self, geojson: dict) -> None:
        # Verifica uma amostra: para SP, longitude e negativa (~ -44 a -53) e
        # tem magnitude maior que a latitude (~ -19 a -25) - se os eixos
        # estivessem trocados (lat,lon em vez de lon,lat), essa relacao
        # inverteria para a maioria dos pontos.
        amostra = geojson["features"][:20]
        for feature in amostra:
            geometry = feature["geometry"]
            anel = geometry["coordinates"][0] if geometry["type"] == "Polygon" else geometry["coordinates"][0][0]
            lon, lat = anel[0]
            assert -54 <= lon <= -43, f"longitude fora da faixa esperada para SP: {lon}"
            assert -26 <= lat <= -19, f"latitude fora da faixa esperada para SP: {lat}"
