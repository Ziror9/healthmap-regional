"""
Testes unitarios dos checks de qualidade (healthmap_etl/quality.py). Todo
check e uma funcao pura (str/float -> (bool, str|None)), sem rede nem banco -
os testes aqui rodam instantaneamente e nao dependem de nenhuma fonte externa
estar no ar.
"""

from __future__ import annotations

from healthmap_etl import quality


class TestCheckCodigoIbge7Sp:
    def test_codigo_valido_de_sp_passa(self) -> None:
        ok, detalhe = quality.check_codigo_ibge7_sp("3550308")  # Sao Paulo capital
        assert ok is True
        assert detalhe is None

    def test_codigo_de_outra_uf_falha(self) -> None:
        ok, detalhe = quality.check_codigo_ibge7_sp("3304557")  # Rio de Janeiro
        assert ok is False
        assert detalhe is not None

    def test_codigo_fora_do_formato_falha(self) -> None:
        ok, _ = quality.check_codigo_ibge7_sp("abc123")
        assert ok is False

    def test_codigo_curto_demais_falha(self) -> None:
        ok, _ = quality.check_codigo_ibge7_sp("355030")
        assert ok is False

    def test_codigo_vazio_falha(self) -> None:
        ok, _ = quality.check_codigo_ibge7_sp("")
        assert ok is False


class TestCheckSemDuplicidade:
    def test_lista_sem_repeticao_passa(self) -> None:
        ok, detalhe = quality.check_sem_duplicidade(["3550308", "3509502", "3304557"], "codigo")
        assert ok is True
        assert detalhe is None

    def test_lista_com_repeticao_falha_e_reporta_a_chave(self) -> None:
        ok, detalhe = quality.check_sem_duplicidade(["3550308", "3550308", "3509502"], "codigo")
        assert ok is False
        assert detalhe is not None
        assert "3550308" in detalhe

    def test_lista_vazia_passa(self) -> None:
        ok, _ = quality.check_sem_duplicidade([], "codigo")
        assert ok is True


class TestCheckCoordenadaDentroSp:
    def test_coordenada_dentro_do_estado_passa(self) -> None:
        ok, _ = quality.check_coordenada_dentro_sp(-23.55, -46.63)  # capital
        assert ok is True

    def test_ausencia_de_coordenada_nao_e_erro(self) -> None:
        ok, detalhe = quality.check_coordenada_dentro_sp(None, None)
        assert ok is True
        assert detalhe is None

    def test_coordenada_fora_do_intervalo_geografico_valido_falha(self) -> None:
        ok, _ = quality.check_coordenada_dentro_sp(200, -46)
        assert ok is False

    def test_coordenada_valida_mas_fora_de_sp_falha(self) -> None:
        ok, _ = quality.check_coordenada_dentro_sp(-8.05, -34.9)  # Recife
        assert ok is False


class TestCheckCodigoCnes:
    def test_codigo_de_7_digitos_passa(self) -> None:
        ok, _ = quality.check_codigo_cnes("2077469")
        assert ok is True

    def test_codigo_com_letras_falha(self) -> None:
        ok, _ = quality.check_codigo_cnes("20774AB")
        assert ok is False

    def test_codigo_vazio_falha(self) -> None:
        ok, _ = quality.check_codigo_cnes("")
        assert ok is False


class TestCheckNaoNegativo:
    def test_valor_positivo_passa(self) -> None:
        ok, detalhe = quality.check_nao_negativo(10, "leitosSus")
        assert ok is True
        assert detalhe is None

    def test_zero_passa(self) -> None:
        ok, _ = quality.check_nao_negativo(0, "leitosSus")
        assert ok is True

    def test_valor_negativo_falha(self) -> None:
        ok, detalhe = quality.check_nao_negativo(-1, "leitosSus")
        assert ok is False
        assert "leitosSus" in (detalhe or "")

    def test_none_passa(self) -> None:
        ok, _ = quality.check_nao_negativo(None, "leitosSus")
        assert ok is True


class TestCheckMunicipioReferenciadoExiste:
    def test_codigo_conhecido_passa(self) -> None:
        ok, _ = quality.check_municipio_referenciado_existe("350308", {"350308", "350100"})
        assert ok is True

    def test_codigo_desconhecido_falha(self) -> None:
        ok, detalhe = quality.check_municipio_referenciado_existe("999999", {"350308"})
        assert ok is False
        assert "999999" in (detalhe or "")

    def test_none_falha(self) -> None:
        ok, _ = quality.check_municipio_referenciado_existe(None, {"350308"})
        assert ok is False


class TestCheckCompetenciaArquivoBateComRegistro:
    def test_competencias_iguais_passa(self) -> None:
        ok, detalhe = quality.check_competencia_arquivo_bate_com_registro(2024, 2, 2024, 2)
        assert ok is True
        assert detalhe is None

    def test_ano_diferente_falha(self) -> None:
        ok, _ = quality.check_competencia_arquivo_bate_com_registro(2024, 2, 2023, 2)
        assert ok is False

    def test_mes_diferente_falha(self) -> None:
        ok, _ = quality.check_competencia_arquivo_bate_com_registro(2024, 2, 2024, 3)
        assert ok is False
