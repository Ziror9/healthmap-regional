"""
Testes unitarios de healthmap_etl.sources.seade_ipvs.calcular_ipvs_ponderado_por_municipio -
a logica pura de agregacao (setor censitario -> municipio), separada do I/O
(download/parsing de arquivo), mesmo padrao de test_geografia.py/test_populacao.py.
"""

from __future__ import annotations

from healthmap_etl.sources.seade_ipvs import calcular_ipvs_ponderado_por_municipio


class TestCalcularIpvsPonderadoPorMunicipio:
    def test_media_ponderada_simples(self) -> None:
        ipvs = {
            "A": {"codigo_ibge7": "3500000", "c_ipvs": 2},
            "B": {"codigo_ibge7": "3500000", "c_ipvs": 6},
        }
        populacao = {"A": 100, "B": 100}
        linhas = calcular_ipvs_ponderado_por_municipio(ipvs, populacao)
        assert len(linhas) == 1
        # pesos iguais -> media simples
        assert linhas[0]["valor"] == 4.0
        assert linhas[0]["populacao_usada"] == 200

    def test_peso_maior_puxa_a_media_para_perto_de_si(self) -> None:
        ipvs = {
            "A": {"codigo_ibge7": "3500000", "c_ipvs": 2},
            "B": {"codigo_ibge7": "3500000", "c_ipvs": 6},
        }
        populacao = {"A": 900, "B": 100}
        linhas = calcular_ipvs_ponderado_por_municipio(ipvs, populacao)
        # (2*900 + 6*100) / 1000 = 2.4 - perto do setor A, que pesa mais
        assert linhas[0]["valor"] == 2.4

    def test_setor_nao_classificado_e_excluido_nunca_zerado(self) -> None:
        ipvs = {
            "A": {"codigo_ibge7": "3500000", "c_ipvs": 4},
            "B": {"codigo_ibge7": "3500000", "c_ipvs": None},  # "Nao classificado" na fonte
        }
        populacao = {"A": 100, "B": 500}
        linhas = calcular_ipvs_ponderado_por_municipio(ipvs, populacao)
        # so o setor A entra - o resultado e exatamente 4, nao uma media puxada por um "0" inventado
        assert linhas[0]["valor"] == 4.0
        assert linhas[0]["populacao_usada"] == 100
        assert linhas[0]["setores_usados"] == 1
        assert linhas[0]["setores_no_municipio"] == 2

    def test_setor_sem_populacao_correspondente_e_excluido(self) -> None:
        ipvs = {
            "A": {"codigo_ibge7": "3500000", "c_ipvs": 4},
            "B": {"codigo_ibge7": "3500000", "c_ipvs": 6},  # sem par no arquivo de populacao
        }
        populacao = {"A": 100}
        linhas = calcular_ipvs_ponderado_por_municipio(ipvs, populacao)
        assert linhas[0]["valor"] == 4.0
        assert linhas[0]["setores_usados"] == 1

    def test_municipio_sem_nenhum_setor_classificavel_nao_aparece_no_resultado(self) -> None:
        ipvs = {"A": {"codigo_ibge7": "3500000", "c_ipvs": None}}
        populacao = {"A": 100}
        linhas = calcular_ipvs_ponderado_por_municipio(ipvs, populacao)
        assert linhas == []

    def test_municipios_distintos_nao_se_misturam(self) -> None:
        ipvs = {
            "A": {"codigo_ibge7": "3500000", "c_ipvs": 2},
            "B": {"codigo_ibge7": "3500001", "c_ipvs": 6},
        }
        populacao = {"A": 100, "B": 100}
        linhas = calcular_ipvs_ponderado_por_municipio(ipvs, populacao)
        por_municipio = {l["codigo_ibge7"]: l["valor"] for l in linhas}
        assert por_municipio == {"3500000": 2.0, "3500001": 6.0}

    def test_dicionarios_vazios_devolvem_lista_vazia(self) -> None:
        assert calcular_ipvs_ponderado_por_municipio({}, {}) == []

    def test_populacao_zero_no_setor_e_tratada_como_ausente(self) -> None:
        # peso zero geraria divisao por zero silenciosa se nao filtrado -
        # tratado como "sem populacao conhecida", igual a ausencia de par.
        ipvs = {
            "A": {"codigo_ibge7": "3500000", "c_ipvs": 4},
            "B": {"codigo_ibge7": "3500000", "c_ipvs": 6},
        }
        populacao = {"A": 100, "B": 0}
        linhas = calcular_ipvs_ponderado_por_municipio(ipvs, populacao)
        assert linhas[0]["valor"] == 4.0
        assert linhas[0]["setores_usados"] == 1
