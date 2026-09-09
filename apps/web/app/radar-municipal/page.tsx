'use client';

import type { MunicipioDetalheDTO, RadarMunicipalFiltroResolvidoDTO, RadarMunicipalIndicador, RadarMunicipalItemDTO } from '@healthmap/contracts';
import { ArrowDown, ArrowLeft, ArrowUp } from 'lucide-react';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { MapaSP, type MunicipioNoMapa } from '@/components/charts/map';
import { ProvenanceBadge } from '@/components/domain/provenance-badge';
import { PageContent } from '@/components/layout/page-content';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';
import { ErrorState } from '@/components/states/error-state';
import { LoadingState } from '@/components/states/loading-state';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { ApiRequestError, getIndicadorMunicipios, getMunicipio } from '@/lib/api';
import { useRadarMunicipalFiltros } from '@/lib/use-radar-municipal-filters';
import { formatCompetenciaLabel, formatNumero } from '@/lib/format';
import { EscalaLegenda, type FaixaLegenda } from '@/components/charts/map-legend';
import { FiltrosResponsivos } from '@/components/domain/filtros-responsivos';
import { RankBar } from '@/components/domain/rank-bar';
import { SuppressedValue } from '@/components/states/suppressed-value';
import { FAIXAS_COR_SWATCH, FAIXAS_LABEL, construirEscalaQuantil } from '@/lib/radar-municipal-color';
import { cn } from '@/lib/utils';

/**
 * Radar Municipal (Fase 5.7) - visualizacao territorial dos 645 municipios
 * REAL de SP, coloridos por um indicador a escolha. Consome GET
 * /api/indicadores/municipios (ja resolvido pela API - ano default, anos
 * disponiveis, unidade) e GET /api/municipios/:id para o detalhe ao clicar.
 * Nenhum indice/taxa/RiskScore e calculado aqui - so leitura + apresentacao
 * (mesma filosofia de app/page.tsx e app/radar/page.tsx).
 */

const INDICADORES: { value: RadarMunicipalIndicador; label: string; rankingLabel: string; casasDecimais: number }[] = [
  { value: 'INTERNACOES', label: 'Internações', rankingLabel: 'Internações', casasDecimais: 0 },
  { value: 'TAXA_INTERNACAO_10K_HAB', label: 'Internações / 10 mil hab.', rankingLabel: 'Internações / 10 mil', casasDecimais: 2 },
  { value: 'OBITOS_ONCOLOGICOS', label: 'Óbitos oncológicos', rankingLabel: 'Óbitos oncológicos', casasDecimais: 0 },
  {
    value: 'TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB',
    label: 'Mortalidade oncológica / 10 mil hab.',
    rankingLabel: 'Mortalidade oncológica',
    casasDecimais: 2,
  },
  { value: 'RISK_SCORE', label: 'Risk Score', rankingLabel: 'Risk Score', casasDecimais: 2 },
  { value: 'VULNERABILIDADE', label: 'Vulnerabilidade (IPVS)', rankingLabel: 'Vulnerabilidade (IPVS)', casasDecimais: 2 },
];

function labelIndicador(indicador: RadarMunicipalIndicador): string {
  return INDICADORES.find((i) => i.value === indicador)?.label ?? indicador;
}
function rankingLabelIndicador(indicador: RadarMunicipalIndicador): string {
  return INDICADORES.find((i) => i.value === indicador)?.rankingLabel ?? indicador;
}
function casasDecimais(indicador: RadarMunicipalIndicador): number {
  return INDICADORES.find((i) => i.value === indicador)?.casasDecimais ?? 0;
}

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'pronto'; itens: RadarMunicipalItemDTO[]; meta: RadarMunicipalFiltroResolvidoDTO };

type EstadoDetalhe =
  | { tipo: 'nenhum' }
  | { tipo: 'carregando'; municipioId: number; nome: string }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'pronto'; municipio: MunicipioDetalheDTO };

function RadarMunicipalContent() {
  const { filtros, setIndicador, setAno, setMunicipio, quantidadeAtiva } = useRadarMunicipalFiltros();
  const { indicador, ano, municipioId } = filtros;
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [ordemDesc, setOrdemDesc] = useState(true);
  const [detalhe, setDetalhe] = useState<EstadoDetalhe>({ tipo: 'nenhum' });

  useEffect(() => {
    let cancelado = false;
    setEstado({ tipo: 'carregando' });

    getIndicadorMunicipios({ indicador, ano })
      .then((resposta) => {
        if (!cancelado) setEstado({ tipo: 'pronto', itens: resposta.data, meta: resposta.meta.filtros });
      })
      .catch((erro: unknown) => {
        if (cancelado) return;
        // Link antigo ou ano digitado a mao: em vez de deixar a tela num
        // estado de erro, descarta o ano invalido da URL e deixa a API
        // resolver o mais recente disponivel para este indicador.
        if (erro instanceof ApiRequestError && erro.code === 'ANO_NAO_DISPONIVEL' && ano !== undefined) {
          setAno(undefined);
          return;
        }
        const mensagem = erro instanceof ApiRequestError ? erro.message : 'Falha desconhecida ao consultar a API.';
        setEstado({ tipo: 'erro', mensagem });
      });

    return () => {
      cancelado = true;
    };
  }, [indicador, ano, setAno]);

  /**
   * O municipio selecionado vem da URL: abrir o link direto reproduz a
   * selecao, e o botao voltar do navegador funciona.
   *
   * CORRECAO DE COMPORTAMENTO (E4): o detalhe deixou de ser buscado com o ano
   * do filtro. `GET /api/municipios/:id?ano=N` filtra os indicadores por
   * aquele ano, e o IPVS e de 2022 (ano do Censo) - com `ano=2024` ele
   * sumia da resposta e o painel afirmava "sem registro" para um valor que
   * EXISTE. Era falso desde a Fase 5.7 e so ficou visivel agora, porque o
   * painel passou a nomear o tipo de ausencia em vez de mostrar "-".
   * O painel ja escolhe o valor mais recente de cada metrica (comportamento
   * documentado na Fase 5.7 #10), entao filtrar por ano aqui so podia
   * esconder dado.
   */
  useEffect(() => {
    if (municipioId === undefined) {
      setDetalhe({ tipo: 'nenhum' });
      return;
    }
    let cancelado = false;
    setDetalhe({ tipo: 'carregando', municipioId, nome: '' });
    getMunicipio(municipioId)
      .then((resposta) => {
        if (!cancelado) setDetalhe({ tipo: 'pronto', municipio: resposta.data });
      })
      .catch((erro: unknown) => {
        if (cancelado) return;
        const mensagem = erro instanceof ApiRequestError ? erro.message : 'Falha ao carregar o detalhe do município.';
        setDetalhe({ tipo: 'erro', mensagem });
      });
    return () => {
      cancelado = true;
    };
  }, [municipioId]);

  function selecionarMunicipio(item: RadarMunicipalItemDTO) {
    setMunicipio(item.municipio.id);
  }

  return (
    <>
      <PageHeader
        title="Radar Municipal"
        description="Mapa territorial interativo dos municípios de São Paulo, por indicador."
        actions={
          <FiltrosResponsivos quantidadeAtiva={quantidadeAtiva}>
            <Select
              value={indicador}
              onChange={(e) => setIndicador(e.target.value as RadarMunicipalIndicador)}
              aria-label="Indicador"
            >
              {INDICADORES.map((i) => (
                <option key={i.value} value={i.value}>
                  {i.label}
                </option>
              ))}
            </Select>
            {estado.tipo === 'pronto' && estado.meta.anosDisponiveis.length > 0 && (
              <Select
                value={estado.meta.ano ?? ''}
                onChange={(e) => setAno(Number(e.target.value))}
                aria-label="Ano"
              >
                {estado.meta.anosDisponiveis.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            )}
          </FiltrosResponsivos>
        }
      />
      <PageContent className="space-y-4">
        {estado.tipo === 'carregando' && <LoadingState label="Carregando Radar Municipal..." variant="map" />}
        {estado.tipo === 'erro' && <ErrorState description={estado.mensagem} />}
        {estado.tipo === 'pronto' && (
          <RadarMunicipalPronto
            itens={estado.itens}
            meta={estado.meta}
            ordemDesc={ordemDesc}
            onToggleOrdem={() => setOrdemDesc((atual) => !atual)}
            onSelecionarMunicipio={selecionarMunicipio}
            onLimparSelecao={() => setMunicipio(undefined)}
            detalhe={detalhe}
          />
        )}
      </PageContent>
    </>
  );
}

function RadarMunicipalPronto({
  itens,
  meta,
  ordemDesc,
  onToggleOrdem,
  onSelecionarMunicipio,
  onLimparSelecao,
  detalhe,
}: {
  itens: RadarMunicipalItemDTO[];
  meta: RadarMunicipalFiltroResolvidoDTO;
  ordemDesc: boolean;
  onToggleOrdem: () => void;
  onSelecionarMunicipio: (item: RadarMunicipalItemDTO) => void;
  onLimparSelecao: () => void;
  detalhe: EstadoDetalhe;
}) {
  const escala = useMemo(() => construirEscalaQuantil(itens), [itens]);
  const itemPorCodigo = useMemo(() => new Map(itens.map((i) => [i.municipio.codigoIbge7, i])), [itens]);
  const casas = casasDecimais(meta.indicador);

  const municipiosParaMapa = useMemo<MunicipioNoMapa[]>(
    () => itens.map((i) => ({ id: i.municipio.id, codigoIbge7: i.municipio.codigoIbge7, nome: i.municipio.nome, classificacao: null, indice: null })),
    [itens],
  );

  /**
   * Quantos municipios em cada faixa de quantil - contagem dos valores que a
   * API ja devolveu, usando o mesmo `faixaPara` que colore o mapa. Nenhum
   * corte novo e calculado aqui.
   */
  const faixasLegenda = useMemo<FaixaLegenda[]>(() => {
    const contagem = new Array<number>(FAIXAS_COR_SWATCH.length).fill(0);
    for (const item of itens) {
      if (!item.disponivel || item.valor === null) continue;
      const faixa = escala.faixaPara(item.valor);
      contagem[faixa] = (contagem[faixa] ?? 0) + 1;
    }
    return FAIXAS_COR_SWATCH.map((swatchClass, indice) => ({
      chave: String(indice),
      label: FAIXAS_LABEL[indice]!,
      swatchClass,
      quantidade: contagem[indice] ?? 0,
    }));
  }, [itens, escala]);

  const ranking = useMemo(() => {
    const disponiveis = itens.filter((i): i is RadarMunicipalItemDTO & { valor: number } => i.disponivel && i.valor !== null);
    const sinal = ordemDesc ? -1 : 1;
    return [...disponiveis].sort((a, b) => (a.valor - b.valor) * sinal);
  }, [itens, ordemDesc]);
  const semDado = itens.length - ranking.length;

  if (itens.every((i) => !i.disponivel)) {
    return (
      <EmptyState
        title="Nenhum município com dado disponível para este indicador."
        description="Todos os municípios estão suprimidos (menos de 5 casos) ou sem dado nesta seleção. Tente outro indicador ou ano."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {ranking.length} de {itens.length} municípios com dado disponível · unidade: {meta.unidade}
          {meta.origem && (
            <>
              {' · '}
              <ProvenanceBadge origem={meta.origem} className="align-middle" />
            </>
          )}
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <div className="min-w-0 space-y-2">
          <MapaSP
            municipios={municipiosParaMapa}
            corPorCodigo={(codigo) => {
              const item = itemPorCodigo.get(codigo);
              return item ? escala.corPara(item.valor, item.disponivel) : 'fill-muted';
            }}
            tooltipPorCodigo={(codigo, m) => {
              const item = itemPorCodigo.get(codigo);
              if (!item) return m.nome;
              if (!item.disponivel) return `${m.nome}\n${item.motivo ?? 'Não disponível'}`;
              return `${m.nome}\n${labelIndicador(meta.indicador)}: ${formatNumero(item.valor!, casas)} ${meta.unidade}`;
            }}
            onClickMunicipio={(m) => {
              const item = itemPorCodigo.get(m.codigoIbge7);
              if (item) onSelecionarMunicipio(item);
            }}
            selecionadoId={
              detalhe.tipo === 'pronto' ? detalhe.municipio.id : detalhe.tipo === 'carregando' ? detalhe.municipioId : null
            }
            legenda={
              <EscalaLegenda
                faixas={faixasLegenda}
                semDado={{ quantidade: semDado, motivo: 'suprimido (n<5) ou sem registro no ano' }}
                descricao={`unidade: ${meta.unidade}`}
              />
            }
          />
          <p className="text-caption leading-relaxed text-muted-foreground">
            Clique em um município para abrir o detalhamento ao lado. Municípios em cinza não têm dado disponível
            nesta seleção (suprimido por privacidade ou sem registro no ano).
          </p>
        </div>

        {/* Coluna lateral: ranking OU detalhe do municipio selecionado. Antes o
            detalhe abria ABAIXO do ranking, fora da tela - clicar num municipio
            dava a impressao de que nada acontecia. Trocar a coluna mantem o mapa
            do lado do detalhe, que e a comparacao que interessa. */}
        <div className="min-w-0">
          {detalhe.tipo === 'nenhum' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-title-sm font-semibold text-foreground">
                  Ranking — {rankingLabelIndicador(meta.indicador)}
                </h2>
                <button
                  type="button"
                  onClick={onToggleOrdem}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-caption text-muted-foreground hover:bg-surface-muted"
                >
                  {ordemDesc ? <ArrowDown className="h-3 w-3" aria-hidden /> : <ArrowUp className="h-3 w-3" aria-hidden />}
                  {ordemDesc ? 'Maior → menor' : 'Menor → maior'}
                </button>
              </div>
              <div className="max-h-[460px] space-y-0.5 overflow-y-auto pr-1">
                {ranking.map((item, indice) => (
                  <RankBar
                    key={item.municipio.id}
                    posicao={indice + 1}
                    nome={item.municipio.nome}
                    valor={item.valor}
                    valorFormatado={formatNumero(item.valor, casas)}
                    maximo={ranking[0]?.valor ?? 0}
                    onClick={() => onSelecionarMunicipio(item)}
                  />
                ))}
              </div>
              {semDado > 0 && (
                <p className="text-caption text-muted-foreground">
                  <span className="tabular">{semDado}</span> município(s) sem dado disponível — não entram no
                  ranking, e não são zero.
                </p>
              )}
            </div>
          ) : (
            <DetalheMunicipio detalhe={detalhe} indicador={meta.indicador} onVoltar={onLimparSelecao} />
          )}
        </div>
      </div>
    </div>
  );
}

const CAMPOS_DETALHE: { indicador: RadarMunicipalIndicador; label: string }[] = [
  { indicador: 'INTERNACOES', label: 'Internações' },
  { indicador: 'TAXA_INTERNACAO_10K_HAB', label: 'Internações / 10 mil hab.' },
  { indicador: 'OBITOS_ONCOLOGICOS', label: 'Óbitos oncológicos' },
  { indicador: 'TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB', label: 'Mortalidade oncológica / 10 mil hab.' },
  { indicador: 'RISK_SCORE', label: 'Risk Score' },
  { indicador: 'VULNERABILIDADE', label: 'Vulnerabilidade (IPVS)' },
];

function DetalheMunicipio({
  detalhe,
  indicador,
  onVoltar,
}: {
  detalhe: EstadoDetalhe;
  indicador: RadarMunicipalIndicador;
  onVoltar: () => void;
}) {
  if (detalhe.tipo === 'nenhum') return null;

  return (
    <Card className="p-4">
      <button
        type="button"
        onClick={onVoltar}
        className="mb-3 inline-flex items-center gap-1.5 rounded-md text-caption text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Voltar ao ranking
      </button>

      {detalhe.tipo === 'carregando' && <LoadingState label="Carregando município..." variant="panel" />}
      {detalhe.tipo === 'erro' && <ErrorState description={detalhe.mensagem} />}
      {detalhe.tipo === 'pronto' && (
        <div className="space-y-3">
          <div>
            <h3 className="text-title font-semibold text-foreground">{detalhe.municipio.nome}</h3>
            <p className="text-caption text-muted-foreground">
              {detalhe.municipio.regiaoSaude.nome} · {detalhe.municipio.uf} · IBGE {detalhe.municipio.codigoIbge7}
            </p>
          </div>
          <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {CAMPOS_DETALHE.map((campo) => (
              <LinhaDetalhe key={campo.indicador} municipio={detalhe.municipio} campo={campo} destacado={campo.indicador === indicador} />
            ))}
          </dl>
        </div>
      )}
    </Card>
  );
}

function LinhaDetalhe({
  municipio,
  campo,
  destacado,
}: {
  municipio: MunicipioDetalheDTO;
  campo: { indicador: RadarMunicipalIndicador; label: string };
  destacado: boolean;
}) {
  const casas = casasDecimais(campo.indicador);
  let valorTexto: string | null = null;

  if (campo.indicador === 'INTERNACOES') {
    const linha = [...municipio.internacoesAnuais].sort((a, b) => b.ano - a.ano)[0];
    valorTexto = linha && linha.disponivel && linha.total !== null ? `${formatNumero(linha.total, 0)} (${linha.ano})` : null;
  } else if (campo.indicador === 'OBITOS_ONCOLOGICOS') {
    const linha = [...municipio.obitosOncologicosAnuais].sort((a, b) => b.ano - a.ano)[0];
    valorTexto = linha && linha.disponivel && linha.total !== null ? `${formatNumero(linha.total, 0)} (${linha.ano})` : null;
  } else if (campo.indicador === 'RISK_SCORE') {
    const linha = [...municipio.riscos].sort((a, b) => b.competencia.ano * 100 + b.competencia.mes - (a.competencia.ano * 100 + a.competencia.mes))[0];
    valorTexto = linha ? `${formatNumero(linha.indice, 2)} (${formatCompetenciaLabel(linha.competencia.ano, linha.competencia.mes)})` : null;
  } else {
    const indicadorDefinicaoId =
      campo.indicador === 'TAXA_INTERNACAO_10K_HAB'
        ? 'TAXA_INTERNACAO_10K_HAB'
        : campo.indicador === 'TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB'
          ? 'TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB'
          : 'IPVS_MEDIA_PONDERADA_SETOR';
    const linha = [...municipio.indicadores].filter((i) => i.indicadorDefinicaoId === indicadorDefinicaoId).sort((a, b) => b.ano - a.ano)[0];
    valorTexto = linha ? `${formatNumero(linha.valor, casas)} (${linha.ano})` : null;
  }

  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-3 rounded-md border p-2.5',
        destacado ? 'border-primary/40 bg-primary/5' : 'border-border',
      )}
    >
      <dt className="text-caption text-muted-foreground">{campo.label}</dt>
      <dd className="shrink-0">
        {valorTexto === null ? (
          /* Ausencia nunca vira "0" nem tracinho: a API nao informa POR QUE
             falta neste recorte (supressao ou ausencia de registro), entao o
             rotulo honesto e "sem registro" com a explicacao no tooltip -
             nunca afirmar supressao sem saber. */
          <SuppressedValue
            tipo="sem-dado"
            motivo={`Sem valor disponível de ${campo.label.toLowerCase()} para este município no período consultado. Pode ser supressão por privacidade (n<5) ou ausência de registro — o detalhe não distingue os dois.`}
          />
        ) : (
          <span className="tabular text-body font-medium text-foreground">{valorTexto}</span>
        )}
      </dd>
    </div>
  );
}

export default function RadarMunicipalPage() {
  return (
    <Suspense fallback={<LoadingState label="Carregando..." />}>
      <RadarMunicipalContent />
    </Suspense>
  );
}
