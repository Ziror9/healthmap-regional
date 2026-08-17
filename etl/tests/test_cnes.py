"""
Testes unitarios das funcoes puras de healthmap_etl/sources/cnes.py:
normalizacao de nome de municipio (usada no cruzamento por nome, ja que a
fonte de leitos nao devolve codigo IBGE do municipio) e deduplicacao de
hospitais (correcao do bug real de paginacao instavel encontrado ao
ingerir - ver docstring do modulo cnes.py e docs/fase-5-relatorio.md).
"""

from __future__ import annotations

from healthmap_etl.sources import cnes


class TestNormalizarNomeMunicipio:
    def test_remove_acentos(self) -> None:
        assert cnes.normalizar_nome_municipio("São Paulo") == "SAO PAULO"

    def test_ja_maiusculo_sem_acento_mantem(self) -> None:
        assert cnes.normalizar_nome_municipio("BAURU") == "BAURU"

    def test_colapsa_espacos_extras(self) -> None:
        assert cnes.normalizar_nome_municipio("Ribeirão   Preto") == "RIBEIRAO PRETO"

    def test_nomes_com_grafias_diferentes_convergem(self) -> None:
        a = cnes.normalizar_nome_municipio("São José do Rio Preto")
        b = cnes.normalizar_nome_municipio("SAO JOSE DO RIO PRETO")
        assert a == b


class TestDeduplicarHospitais:
    def _hospital(self, nome: str, endereco: str = "RUA X", cep: str = "01000-000", **extra: object) -> dict:
        return {
            "nome_do_hospital": nome,
            "enderco_do_hospital": endereco,
            "numero_do_cep_do_hospital": cep,
            **extra,
        }

    def test_sem_duplicatas_preserva_todos(self) -> None:
        registros = [self._hospital("Hospital A"), self._hospital("Hospital B")]
        unicos, removidas = cnes.deduplicar_hospitais(registros)
        assert len(unicos) == 2
        assert removidas == 0

    def test_mesmo_hospital_em_paginas_diferentes_e_deduplicado(self) -> None:
        # Reproduz o bug real: mesmo nome+endereco+CEP aparecendo 2x (offset
        # instavel da paginacao da API), com o resto do payload identico.
        pagina1 = self._hospital("SANTA CASA DE TAQUARITINGA", quantidade_total_de_leitos_do_hosptial=100)
        pagina2 = self._hospital("SANTA CASA DE TAQUARITINGA", quantidade_total_de_leitos_do_hosptial=100)
        unicos, removidas = cnes.deduplicar_hospitais([pagina1, pagina2])
        assert len(unicos) == 1
        assert removidas == 1

    def test_hospitais_com_mesmo_nome_mas_endereco_diferente_nao_sao_fundidos(self) -> None:
        # Endereco diferente = estabelecimentos distintos (comum em capitais
        # com redes hospitalares de mesmo nome em unidades diferentes).
        a = self._hospital("HOSPITAL SAO LUCAS", endereco="AV A, 100")
        b = self._hospital("HOSPITAL SAO LUCAS", endereco="AV B, 200")
        unicos, removidas = cnes.deduplicar_hospitais([a, b])
        assert len(unicos) == 2
        assert removidas == 0

    def test_lista_vazia(self) -> None:
        unicos, removidas = cnes.deduplicar_hospitais([])
        assert unicos == []
        assert removidas == 0

    def test_preserva_ordem_da_primeira_ocorrencia(self) -> None:
        a = self._hospital("Hospital A", quantidade_total_de_leitos_do_hosptial=10)
        a_dup = self._hospital("Hospital A", quantidade_total_de_leitos_do_hosptial=10)
        b = self._hospital("Hospital B")
        unicos, removidas = cnes.deduplicar_hospitais([a, a_dup, b])
        assert [u["nome_do_hospital"] for u in unicos] == ["Hospital A", "Hospital B"]
        assert removidas == 1
