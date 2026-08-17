"""
Testes unitarios da transformacao SIH-RD (healthmap_etl/sih_transform.py) -
100% funcoes puras, sem pandas/pysus/rede/banco. Cobre especificamente os
casos que o pedido de implementacao do SIH exigiu (C00, C01, C97, fora do
recorte, valores ausentes, codigos invalidos) mais os casos reais
observados na amostra SP/2024-02 usada como POC (COD_IDADE=5 nao
documentado, SEXO fora de 1/3).
"""

from __future__ import annotations

from healthmap_etl import sih_transform as t


class TestEhCidOncologico:
    def test_c00_primeiro_codigo_do_recorte(self) -> None:
        assert t.eh_cid_oncologico("C00") is True

    def test_c01(self) -> None:
        assert t.eh_cid_oncologico("C01") is True

    def test_c97_ultimo_codigo_do_recorte(self) -> None:
        assert t.eh_cid_oncologico("C97") is True

    def test_codigo_com_subcategoria_dentro_do_recorte(self) -> None:
        assert t.eh_cid_oncologico("C509") is True
        assert t.eh_cid_oncologico("C61") is True

    def test_codigo_fora_do_recorte_c98(self) -> None:
        assert t.eh_cid_oncologico("C98") is False

    def test_codigo_de_outro_capitulo(self) -> None:
        assert t.eh_cid_oncologico("I350") is False  # doenca cardiovascular
        assert t.eh_cid_oncologico("K269") is False  # doenca digestiva
        assert t.eh_cid_oncologico("E100") is False  # diabetes

    def test_codigo_d_proximo_mas_fora_do_capitulo_c(self) -> None:
        assert t.eh_cid_oncologico("D48") is False  # neoplasia de comportamento incerto, fora de C00-C97

    def test_valor_ausente(self) -> None:
        assert t.eh_cid_oncologico(None) is False
        assert t.eh_cid_oncologico("") is False

    def test_codigo_invalido_nao_derruba(self) -> None:
        assert t.eh_cid_oncologico("XYZ") is False
        assert t.eh_cid_oncologico("123") is False

    def test_case_insensitive(self) -> None:
        assert t.eh_cid_oncologico("c509") is True


class TestMapearSexo:
    def test_codigo_1_masculino(self) -> None:
        assert t.mapear_sexo("1") == "MASCULINO"

    def test_codigo_3_feminino(self) -> None:
        assert t.mapear_sexo("3") == "FEMININO"

    def test_codigo_fora_do_documentado_vira_ignorado(self) -> None:
        assert t.mapear_sexo("0") == "IGNORADO"
        assert t.mapear_sexo("9") == "IGNORADO"

    def test_valor_ausente_vira_ignorado(self) -> None:
        assert t.mapear_sexo(None) == "IGNORADO"
        assert t.mapear_sexo("") == "IGNORADO"


class TestCalcularFaixaEtaria:
    def test_cod_idade_4_anos_bucket_00_09(self) -> None:
        assert t.calcular_faixa_etaria("4", "5") == "FX_00_09"

    def test_cod_idade_4_anos_bucket_intermediario(self) -> None:
        assert t.calcular_faixa_etaria("4", "51") == "FX_50_59"

    def test_cod_idade_4_anos_80_ou_mais(self) -> None:
        assert t.calcular_faixa_etaria("4", "80") == "FX_80_MAIS"
        assert t.calcular_faixa_etaria("4", "120") == "FX_80_MAIS"

    def test_cod_idade_2_dias_vira_faixa_00_09(self) -> None:
        assert t.calcular_faixa_etaria("2", "15") == "FX_00_09"

    def test_cod_idade_3_meses_vira_faixa_00_09(self) -> None:
        assert t.calcular_faixa_etaria("3", "6") == "FX_00_09"

    def test_cod_idade_0_ignorada_e_rejeitada(self) -> None:
        assert t.calcular_faixa_etaria("0", "999") is None

    def test_cod_idade_nao_documentado_e_rejeitada_nao_adivinhada(self) -> None:
        # Codigo '5' observado em dado real (SP/2024-02) mas fora do
        # dicionario oficial (0/2/3/4) - a regra e rejeitar, nao supor.
        assert t.calcular_faixa_etaria("5", "40") is None

    def test_idade_nao_numerica_e_rejeitada(self) -> None:
        assert t.calcular_faixa_etaria("4", "abc") is None

    def test_idade_ausente_e_rejeitada(self) -> None:
        assert t.calcular_faixa_etaria("4", None) is None

    def test_idade_negativa_e_rejeitada(self) -> None:
        assert t.calcular_faixa_etaria("4", "-1") is None


class TestNormalizarCodigoMunicipio6:
    def test_ja_com_6_digitos(self) -> None:
        assert t.normalizar_codigo_municipio6("350600") == "350600"

    def test_preenche_zeros_a_esquerda(self) -> None:
        assert t.normalizar_codigo_municipio6("5600") == "005600"

    def test_aceita_int(self) -> None:
        assert t.normalizar_codigo_municipio6(350600) == "350600"


class TestExtrairAnoMesCompetencia:
    def test_valores_string(self) -> None:
        assert t.extrair_ano_mes_competencia("2024", "02") == (2024, 2)

    def test_valores_int(self) -> None:
        assert t.extrair_ano_mes_competencia(2024, 2) == (2024, 2)
