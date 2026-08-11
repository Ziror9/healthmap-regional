# Limitacoes conhecidas

> Documento vivo. Toda limitacao que afeta a leitura dos numeros deve estar
> registrada aqui e refletida na interface do produto.

## 1. Estagio do projeto

- **O projeto nao esta pronto para uso operacional.** Nao deve embasar decisao
  de saude publica no estado atual.
- Fase 0 concluida: existe fundacao tecnica, nao existe produto.
- Nao ha dashboard, indicadores, Radar de Risco calculado nem dados carregados.

## 2. Dados

- **Dados DEMO nao sao dados oficiais.** A base DEMO (Fase 1) e sintetica,
  gerada para desenvolvimento e demonstracao. A geografia sera real; os numeros,
  nao. Nenhum valor DEMO pode ser lido como informacao sobre a situacao real de
  qualquer municipio.
- **Integracao com o SIH/SUS ainda nao implementada.**
- **Integracao com o CNES ainda nao implementada.**
- **Integracao com o IBGE ainda nao implementada.**

## 3. Limitacoes estruturais das fontes (valerao mesmo com dados reais)

- **Defasagem de publicacao.** Os dados do SIH/SUS chegam com atraso relevante.
  O produto nunca sera "tempo real" e nao deve usar essa linguagem. A competencia
  mais recente e a defasagem em dias devem ser exibidas.
- **Revisao retroativa.** O DATASUS revisa dados ja publicados; competencias
  antigas mudam. Por isso o reprocessamento periodico e o versionamento das
  pontuacoes sao obrigatorios.
- **Subnotificacao e inconsistencia** nos registros de origem.
- **Cobertura apenas SUS.** Nao inclui saude suplementar. Municipios com alta
  cobertura de planos privados aparecerao subestimados. Isso e uma limitacao
  estrutural, nao um erro do sistema.
- **Leitos autodeclarados.** A capacidade vem do CNES por autodeclaracao dos
  estabelecimentos e pode estar desatualizada.

## 4. Indicadores

- **Todos os indicadores precisam de validacao** antes de qualquer uso real.
- **Dados de pressao hospitalar sao estimativas**, derivadas de pacientes-dia e
  capacidade de leitos. Nao sao ocupacao observada. Ver
  [`risk-methodology.md`](./risk-methodology.md).
- Indicadores agregados por municipio nao representam nenhum estabelecimento
  especifico.
- Letalidade mais alta em municipios-polo pode refletir a complexidade dos casos
  recebidos, e nao desempenho assistencial.

## 5. Radar de Risco

- **Ainda nao possui metodologia formal.** Conceito documentado, formula nao
  definida nem implementada.
- Os pesos iniciais serao arbitrarios e marcados como nao oficiais ate haver
  calibracao e validacao.
- **A fonte do componente de vulnerabilidade ainda nao foi definida.** Ate la o
  indice sera calculado com os componentes disponiveis, e a ausencia sera
  declarada.
- O indice e analitico e experimental. Nao e diagnostico clinico.

## 6. Escopo

- MVP restrito ao estado de Sao Paulo.
- Recorte oncologico restrito a neoplasias malignas (CID-10 C00-C97).
- Ate 5 anos de historico, **se** os dados estiverem disponiveis e consistentes.
  Caso a disponibilidade real seja menor, sera usado o maior periodo confiavel e
  a limitacao sera registrada aqui.
- Agregacao por Regiao de Saude prevista, ainda nao implementada.

## 7. Plataforma

- Nao ha autenticacao. A camada de autorizacao existe preparada, porem inerte,
  ate a Fase 6.
- Nao ha trilha de auditoria de consultas ainda.
- O enquadramento juridico do tratamento de dados (LGPD, designacao de
  responsavel, eventual dispensa de CEP) **nao foi validado juridicamente**. O
  projeto adota postura conservadora - dados publicos, agregados, sem base
  identificavel - mas nao declara conformidade.
