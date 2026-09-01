"""
Testes unitarios de healthmap_etl.sim_transform - funcoes puras (sem pandas/
banco) usadas por etl/ingest_sim.py (Fase 5.6). Mesmo padrao de
test_sih_transform.py/test_cnes.py: so logica de negocio, testavel em
qualquer ambiente.
"""

from __future__ import annotations

from healthmap_etl import quality
from healthmap_etl.sim_transform import (
    calcular_faixa_etaria_sim,
    deduplicar_por_chave_natural,
    eh_cid_oncologico,
    esta_suprimido,
    extrair_ano_mes_competencia,
    mapear_sexo_sim,
    normalizar_codigo_municipio6,
)


class TestFiltroC00C97:
    """1. filtro C00-C97 + 2. exclusao de causas fora do recorte."""

    def test_causas_dentro_do_recorte_sao_aceitas(self) -> None:
        assert eh_cid_oncologico("C189") is True  # neoplasia maligna de colon
        assert eh_cid_oncologico("C01") is True
        assert eh_cid_oncologico("C979") is True  # limite superior do recorte

    def test_causas_fora_do_recorte_sao_excluidas(self) -> None:
        assert eh_cid_oncologico("I671") is False  # doenca cerebrovascular
        assert eh_cid_oncologico("X930") is False  # causa externa
        assert eh_cid_oncologico("D179") is False  # neoplasia BENIGNA (fora de C00-C97 de proposito)
        assert eh_cid_oncologico("C989") is False  # fora do capitulo (98 > 97)

    def test_valor_ausente_ou_vazio_e_excluido(self) -> None:
        assert eh_cid_oncologico(None) is False
        assert eh_cid_oncologico("") is False

    def test_reaproveita_a_mesma_funcao_do_sih_sem_segunda_implementacao(self) -> None:
        from healthmap_etl.sih_transform import eh_cid_oncologico as eh_cid_oncologico_sih

        assert eh_cid_oncologico is eh_cid_oncologico_sih


class TestDeduplicacao:
    """3. deduplicacao + 4. desempate."""

    def _registro(self, **kwargs: object) -> dict:
        base = {
            "CODMUNRES": "355030", "DTOBITO": "11102023", "SEXO": "1", "IDADE": "490",
            "CAUSABAS": "C189", "HORAOBITO": "1850", "DTRECEBIM": "24012024", "DTRECORIGA": "24012024",
        }
        base.update(kwargs)
        return base

    def test_sem_duplicatas_preserva_todos(self) -> None:
        registros = [self._registro(HORAOBITO="1000"), self._registro(HORAOBITO="1100")]
        unicos, removidos = deduplicar_por_chave_natural(registros)
        assert len(unicos) == 2
        assert removidos == 0

    def test_duplicata_identica_e_removida(self) -> None:
        # Reproduz o caso real encontrado na validacao: mesma chave, mesmas
        # datas de recebimento - sem sinal de revisao para desempatar.
        registros = [self._registro(), self._registro()]
        unicos, removidos = deduplicar_por_chave_natural(registros)
        assert len(unicos) == 1
        assert removidos == 1

    def test_desempate_mantem_a_versao_mais_recentemente_recebida(self) -> None:
        antiga = self._registro(DTRECEBIM="17032023", DTRECORIGA="17032023")
        recente = self._registro(DTRECEBIM="26012024", DTRECORIGA="26012024")
        unicos, removidos = deduplicar_por_chave_natural([antiga, recente])
        assert removidos == 1
        assert unicos[0]["DTRECEBIM"] == "26012024"

    def test_registros_com_chave_diferente_nao_sao_fundidos(self) -> None:
        a = self._registro(CODMUNRES="355030")
        b = self._registro(CODMUNRES="350550")
        unicos, removidos = deduplicar_por_chave_natural([a, b])
        assert len(unicos) == 2
        assert removidos == 0

    def test_lista_vazia(self) -> None:
        unicos, removidos = deduplicar_por_chave_natural([])
        assert unicos == []
        assert removidos == 0

    def test_idempotencia_aplicar_duas_vezes_converge(self) -> None:
        """9. idempotencia (nivel de funcao pura): deduplicar um resultado ja deduplicado nao remove nada a mais."""
        registros = [self._registro(), self._registro(), self._registro(HORAOBITO="0900")]
        primeira_passada, _ = deduplicar_por_chave_natural(registros)
        segunda_passada, removidos_na_segunda = deduplicar_por_chave_natural(primeira_passada)
        assert segunda_passada == primeira_passada
        assert removidos_na_segunda == 0


class TestMunicipioInvalido:
    """5. municipio invalido - reaproveita quality.check_municipio_referenciado_existe (generico, ja existente)."""

    def test_codigo_conhecido_passa(self) -> None:
        conhecidos = {"355030", "350550"}
        ok, detalhe = quality.check_municipio_referenciado_existe("355030", conhecidos)
        assert ok is True
        assert detalhe is None

    def test_codigo_desconhecido_e_rejeitado_generic_amente(self) -> None:
        # 350000 (o caso real encontrado na validacao) nao recebe tratamento
        # especial - qualquer codigo fora do conjunto conhecido cai aqui.
        conhecidos = {"355030", "350550"}
        ok, detalhe = quality.check_municipio_referenciado_existe("350000", conhecidos)
        assert ok is False
        assert detalhe is not None

    def test_codigo_ausente_e_rejeitado(self) -> None:
        ok, _ = quality.check_municipio_referenciado_existe(None, {"355030"})
        assert ok is False


class TestSupressao:
    """6. supressao n<5."""

    def test_abaixo_do_limiar_e_suprimido(self) -> None:
        assert esta_suprimido(1) is True
        assert esta_suprimido(4) is True

    def test_no_limiar_e_acima_nao_e_suprimido(self) -> None:
        assert esta_suprimido(5) is False
        assert esta_suprimido(100) is False

    def test_zero_e_suprimido(self) -> None:
        assert esta_suprimido(0) is True


class TestNormalizacaoIdade:
    """7. normalizacao de idade - encoding real do SIM (1o digito = unidade), confirmado contra dado real."""

    def test_menos_de_1_ano_cai_na_faixa_mais_baixa(self) -> None:
        # digitos 0-3 = minutos/horas/dias/meses
        for codigo in ("015", "123", "205", "311"):
            assert calcular_faixa_etaria_sim(codigo) == "FX_00_09"

    def test_anos_mapeia_para_a_faixa_decenal_correta(self) -> None:
        assert calcular_faixa_etaria_sim("400") == "FX_00_09"
        assert calcular_faixa_etaria_sim("409") == "FX_00_09"
        assert calcular_faixa_etaria_sim("435") == "FX_30_39"
        assert calcular_faixa_etaria_sim("490") == "FX_80_MAIS"
        assert calcular_faixa_etaria_sim("499") == "FX_80_MAIS"

    def test_100_anos_ou_mais(self) -> None:
        assert calcular_faixa_etaria_sim("500") == "FX_80_MAIS"  # digito 5 = 100 + resto
        assert calcular_faixa_etaria_sim("523") == "FX_80_MAIS"  # 123 anos

    def test_idade_ignorada_devolve_none_nunca_adivinha(self) -> None:
        assert calcular_faixa_etaria_sim("999") is None  # observado no arquivo real

    def test_formato_invalido_devolve_none(self) -> None:
        assert calcular_faixa_etaria_sim(None) is None
        assert calcular_faixa_etaria_sim("") is None
        assert calcular_faixa_etaria_sim("99") is None  # so 2 digitos
        assert calcular_faixa_etaria_sim("abc") is None


class TestNormalizacaoSexo:
    """8. normalizacao de sexo - encoding do SIM ('1'/'2'/'0'), CONFIRMADAMENTE diferente do SIH ('1'/'3')."""

    def test_masculino(self) -> None:
        assert mapear_sexo_sim("1") == "MASCULINO"

    def test_feminino(self) -> None:
        assert mapear_sexo_sim("2") == "FEMININO"

    def test_ignorado(self) -> None:
        assert mapear_sexo_sim("0") == "IGNORADO"
        assert mapear_sexo_sim(None) == "IGNORADO"
        assert mapear_sexo_sim("9") == "IGNORADO"

    def test_nao_reaproveita_a_codificacao_do_sih_por_engano(self) -> None:
        # No SIH, '3' = feminino. No SIM, '3' nao e um codigo documentado -
        # confirma que os dois sistemas NAO compartilham a mesma tabela.
        assert mapear_sexo_sim("3") == "IGNORADO"


class TestCompetencia:
    def test_extrai_ano_mes_de_dtobito(self) -> None:
        assert extrair_ano_mes_competencia("11102023") == (2023, 10)

    def test_formato_invalido_devolve_none(self) -> None:
        assert extrair_ano_mes_competencia(None) is None
        assert extrair_ano_mes_competencia("2023") is None
        assert extrair_ano_mes_competencia("11132023") is None  # mes 13 invalido


class TestNormalizacaoCodigoMunicipio:
    def test_preenche_com_zeros_a_esquerda(self) -> None:
        assert normalizar_codigo_municipio6(355030) == "355030"
        assert normalizar_codigo_municipio6("5030") == "005030"
