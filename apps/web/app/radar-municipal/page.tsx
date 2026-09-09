'use client';

import type { MunicipioDetalheDTO, RadarMunicipalFiltroResolvidoDTO, RadarMunicipalIndicador, RadarMunicipalItemDTO } from '@healthmap/contracts';
import { ArrowDown, ArrowUp } from 'lucide-react';
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
import { formatCompetenciaLabel, formatNumero } from '@/lib/format';
import { EscalaLegenda, type FaixaLegenda } from '@/components/charts/map-legend';
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
  const [indicador, setIndicador] = useState<RadarMunicipalIndicador>('INTERNACOES');
  const [ano, setAno] = useState<number | undefined>(undefined);
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
        const mensagem = erro instanceof ApiRequestError ? erro.message : 'Falha desconhecida ao consultar a API.';
        setEstado({ tipo: 'erro', mensagem });
      });

    return () => {
      cancelado = true;
    };
  }, [indicador, ano]);

  function selecionarMunicipio(item: RadarMunicipalItemDTO) {
    setDetalhe({ tipo: 'carregando', municipioId: item.municipio.id, nome: item.municipio.nome });
    getMunicipio(item.municipio.id, estado.tipo === 'pronto' && estado.meta.ano !== null ? { ano: estado.meta.ano } : {})
      .then((resposta) => setDetalhe({ tipo: 'pronto', municipio: resposta.data }))
      .catch((erro: unknown) => {
        const mensagem = erro instanceof ApiRequestError ? erro.message : 'Falha ao carregar o detalhe do município.';
        setDetalhe({ tipo: 'erro', mensagem });
      });
  }

  return (
    <>
      <PageHeader
        title="Radar Municipal"
        description="Mapa territorial interativo dos municípios de São Paulo, por indicador."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={indicador}
              onChange={(e) => {
                setIndicador(e.target.value as RadarMunicipalIndicador);
                setAno(undefined);
              }}
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
          </div>
        }
      />
      <PageContent className="space-y-4">
        {estado.tipo === 'carregando' && <LoadingState label="Carregando Radar Municipal..." />}
        {estado.tipo === 'erro' && <ErrorState description={estado.mensagem} />}
        {estado.tipo === 'pronto' && (
          <RadarMunicipalPronto
            itens={estado.itens}
            meta={estado.meta}
            ordemDesc={ordemDesc}
            onToggleOrdem={() => setOrdemDesc((atual) => !atual)}
            onSelecionarMunicipio={selecionarMunicipio}
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
  detalhe,
}: {
  itens: RadarMunicipalItemDTO[];
  meta: RadarMunicipalFiltroResolvidoDTO;
  ordemDesc: boolean;
  onToggleOrdem: () => void;
  onSelecionarMunicipio: (item: RadarMunicipalItemDTO) => void;
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

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
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
          <p className="text-xs leading-relaxed text-muted-foreground">
            Clique em um município para ver o detalhamento completo abaixo. Municípios em cinza não têm dado
            disponível nesta seleção (suprimido por privacidade ou sem registro no ano).
          </p>
        </div>

        <div className="min-w-0 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Ranking — {rankingLabelIndicador(meta.indicador)}</h2>
            <button
              type="button"
              onClick={onToggleOrdem}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-surface-muted"
            >
              {ordemDesc ? <ArrowDown className="h-3 w-3" aria-hidden /> : <ArrowUp className="h-3 w-3" aria-hidden />}
              {ordemDesc ? 'Maior → menor' : 'Menor → maior'}
            </button>
          </div>
          <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
            {ranking.map((item, indice) => (
              <button
                key={item.municipio.id}
                type="button"
                onClick={() => onSelecionarMunicipio(item)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-surface p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-surface-muted"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-6 shrink-0 text-right text-xs text-muted-foreground">{indice + 1}.</span>
                  <span className="truncate text-sm font-medium text-foreground">{item.municipio.nome}</span>
                </span>
                <span className="shrink-0 font-mono text-sm text-foreground">{formatNumero(item.valor, casas)}</span>
              </button>
            ))}
          </div>
          {semDado > 0 && <p className="text-xs text-muted-foreground">{semDado} município(s) sem dado disponível (não exibidos no ranking).</p>}
        </div>
      </div>

      <DetalheMunicipio detalhe={detalhe} indicador={meta.indicador} />
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

function DetalheMunicipio({ detalhe, indicador }: { detalhe: EstadoDetalhe; indicador: RadarMunicipalIndicador }) {
  if (detalhe.tipo === 'nenhum') return null;

  return (
    <Card className="p-5">
      {detalhe.tipo === 'carregando' && <LoadingState label={`Carregando ${detalhe.nome}...`} />}
      {detalhe.tipo === 'erro' && <ErrorState description={detalhe.mensagem} />}
      {detalhe.tipo === 'pronto' && (
        <div className="space-y-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">{detalhe.municipio.nome}</h3>
            <p className="text-xs text-muted-foreground">UF: {detalhe.municipio.uf}</p>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
    <div className={cn('rounded-md border p-2.5', destacado ? 'border-primary/40 bg-primary/5' : 'border-border')}>
      <dt className="text-xs text-muted-foreground">{campo.label}</dt>
      <dd className="mt-0.5 font-mono text-sm font-medium text-foreground">{valorTexto ?? 'Não disponível'}</dd>
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
