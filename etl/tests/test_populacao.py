"""
Testes unitarios de healthmap_etl.sources.ibge._parse_populacao_estimada -
a logica pura de parsing da resposta da API de Agregados/SIDRA (tabela
6579), separada da chamada de rede (mesmo padrao de test_geografia.py:
centroide_aproximado). Formato da resposta confirmado ao vivo contra a API
antes de escrever o parser - ver etl/healthmap_etl/sources/ibge.py.
"""

from __future__ import annotations

from healthmap_etl.sources.ibge import _parse_populacao_estimada


def _corpo(series: list[dict]) -> list[dict]:
    return [{"id": "9324", "variavel": "Populacao residente estimada", "resultados": [{"series": series}]}]


class TestParsePopulacaoEstimada:
    def test_corpo_vazio_devolve_lista_vazia(self) -> None:
        assert _parse_populacao_estimada([]) == []

    def test_uma_localidade_um_ano_com_valor_numerico(self) -> None:
        corpo = _corpo([{"localidade": {"id": "3550308", "nome": "Sao Paulo - SP"}, "serie": {"2024": "11895578"}}])
        linhas = _parse_populacao_estimada(corpo)
        assert linhas == [{"codigo_ibge7": "3550308", "ano": 2024, "populacao_total": 11895578}]

    def test_multiplos_anos_na_mesma_serie(self) -> None:
        corpo = _corpo([{"localidade": {"id": "3550308"}, "serie": {"2024": "11895578", "2025": "11904961"}}])
        linhas = _parse_populacao_estimada(corpo)
        anos = sorted(l["ano"] for l in linhas)
        assert anos == [2024, 2025]

    def test_marcador_nao_numerico_e_tratado_como_ausente_nao_zero(self) -> None:
        # "..." e o marcador real do SIDRA para "dado nao disponivel" -
        # nunca deve virar populacao_total=0 (isso pareceria um municipio
        # despovoado, um erro pior que a ausencia).
        corpo = _corpo([{"localidade": {"id": "3500105"}, "serie": {"2026": "..."}}])
        assert _parse_populacao_estimada(corpo) == []

    def test_valor_vazio_e_none_sao_tratados_como_ausente(self) -> None:
        corpo = _corpo([{"localidade": {"id": "3500105"}, "serie": {"2026": ""}}])
        assert _parse_populacao_estimada(corpo) == []

    def test_multiplas_localidades_sao_todas_incluidas(self) -> None:
        corpo = _corpo(
            [
                {"localidade": {"id": "3500105"}, "serie": {"2024": "35642"}},
                {"localidade": {"id": "3550308"}, "serie": {"2024": "11895578"}},
            ]
        )
        linhas = _parse_populacao_estimada(corpo)
        assert {l["codigo_ibge7"] for l in linhas} == {"3500105", "3550308"}

    def test_valor_negativo_nunca_ocorre_na_fonte_mas_nao_e_isdigit(self) -> None:
        # "-1" nao passa em str.isdigit() (o "-" nao e digito) - documentando
        # o comportamento: um eventual valor negativo seria descartado como
        # ausente, nao gravado como negativo (quality.check_nao_negativo no
        # ingest_populacao.py e uma segunda camada de protecao, redundante
        # de proposito).
        corpo = _corpo([{"localidade": {"id": "3500105"}, "serie": {"2024": "-1"}}])
        assert _parse_populacao_estimada(corpo) == []
