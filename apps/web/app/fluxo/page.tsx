'use client';

import type { FluxoFiltroResolvidoDTO, FluxoItemDTO, FluxoMunicipioDTO, MunicipioResumoDTO, PoloAtendimentoDTO } from '@healthmap/contracts';
import { ArrowLeft, ArrowRight, Search } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CamadaFluxo, CamadaPolos } from '@/components/charts/fluxo-layer';
import { MapaSP, type ContextoOverlay, type MunicipioNoMapa } from '@/components/charts/map';
import { FiltrosResponsivos } from '@/components/domain/filtros-responsivos';
import { ProvenanceBadge } from '@/components/domain/provenance-badge';
import { RankBar } from '@/components/domain/rank-bar';
import { PageContent } from '@/components/layout/page-content';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';
import { ErrorState } from '@/components/states/error-state';
import { LoadingState } from '@/components/states/loading-state';
import { SuppressedBlock, SuppressedValue } from '@/components/states/suppressed-value';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ApiRequestError, getFluxoMunicipio, getPolosAtendimento, getTodosMunicipios } from '@/lib/api';
import { formatNumero } from '@/lib/format';
import {
  OPCOES_TOP,
  montarArcos,
  normalizarBusca,
  resumirEntradas,
  selecionarTopN,
  type ArcoFluxo,
  type ModoFluxo,
  type TopN,
} from '@/lib/fluxo-arcos';
import { inferOrigemMunicipio } from '@/lib/risk-display';
import { useFluxoFiltros } from '@/lib/use-fluxo-filtros';
import { cn } from '@/lib/utils';

/**
 * Fluxo Assistencial (Fase 5.11) - para onde os pacientes oncologicos de cada
 * municipio vao se internar, e de onde vem os que cada polo atende.
 *
 * Consome SO os endpoints que ja existiam desde a Fase 5.8:
 *  - `GET /api/fluxo/polos` na visao de entrada (sem municipio selecionado);
 *  - `GET /api/fluxo/municipios/:id` com um municipio selecionado.
 * Nao ha visao estadual de todos os pares: nao existe endpoint para ela, e
 * nenhum foi criado (decisao registrada em docs/fase-5.11-relatorio.md).
 *
 * Nada e calculado alem de agregacao de apresentacao sobre o que a API
 * devolveu (Top N, soma das entradas visiveis). Par suprimido nunca vira arco
 * nem entra em soma; "nenhum volume visivel" nunca aparece como 0.
 */

type EstadoPolos =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'pronto'; polos: PoloAtendimentoDTO[]; meta: FluxoFiltroResolvidoDTO };

type EstadoFluxo =
  | { tipo: 'nenhum' }
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'sem-ano' }
  | { tipo: 'pronto'; fluxo: FluxoMunicipioDTO };

/** Limite de polos pedido a API (maximo aceito pelo endpoint); o Top N recorta localmente. */
const LIMITE_POLOS = 50;

function FluxoContent() {
  const { filtros, selecionar, limparSelecao, setModo, setTop, setAno, quantidadeAtiva } = useFluxoFiltros();
  const { municipioId, modo, top, ano } = filtros;

  const [municipios, setMunicipios] = useState<MunicipioResumoDTO[]>([]);
  const [polos, setPolos] = useState<EstadoPolos>({ tipo: 'carregando' });
  const [fluxo, setFluxo] = useState<EstadoFluxo>({ tipo: 'nenhum' });
  const [destacadoId, setDestacadoId] = useState<number | null>(null);

  useEffect(() => {
    let cancelado = false;
    getTodosMunicipios()
      .then((lista) => {
        if (!cancelado) setMunicipios(lista.filter((m) => inferOrigemMunicipio(m.codigoIbge7) === 'REAL'));
      })
      .catch(() => {
        /* sem a lista o mapa continua desenhado; so a busca e os nomes nos tooltips ficam indisponiveis */
      });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    let cancelado = false;
    setPolos({ tipo: 'carregando' });
    getPolosAtendimento({ ano, limite: LIMITE_POLOS })
      .then((resposta) => {
        if (!cancelado) setPolos({ tipo: 'pronto', polos: resposta.data, meta: resposta.meta.filtros });
      })
      .catch((erro: unknown) => {
        if (cancelado) return;
        // Ano velho ou digitado a mao: descarta e deixa a API resolver o mais recente.
        if (erro instanceof ApiRequestError && erro.code === 'ANO_NAO_DISPONIVEL' && ano !== undefined) {
          setAno(undefined);
          return;
        }
        setPolos({ tipo: 'erro', mensagem: erro instanceof ApiRequestError ? erro.message : 'Falha ao carregar os polos.' });
      });
    return () => {
      cancelado = true;
    };
  }, [ano, setAno]);

  useEffect(() => {
    if (municipioId === undefined) {
      setFluxo({ tipo: 'nenhum' });
      return;
    }
    let cancelado = false;
    setFluxo({ tipo: 'carregando' });
    getFluxoMunicipio(municipioId, ano !== undefined ? { ano } : {})
      .then((resposta) => {
        if (!cancelado) setFluxo(resposta.data ? { tipo: 'pronto', fluxo: resposta.data } : { tipo: 'sem-ano' });
      })
      .catch((erro: unknown) => {
        if (cancelado) return;
        if (erro instanceof ApiRequestError && erro.code === 'ANO_NAO_DISPONIVEL' && ano !== undefined) {
          setAno(undefined);
          return;
        }
        setFluxo({
          tipo: 'erro',
          mensagem: erro instanceof ApiRequestError ? erro.message : 'Falha ao carregar o fluxo do município.',
        });
      });
    return () => {
      cancelado = true;
    };
  }, [municipioId, ano, setAno]);

  useEffect(() => setDestacadoId(null), [municipioId, modo]);

  const itens = useMemo<FluxoItemDTO[]>(
    () => (fluxo.tipo === 'pronto' ? (modo === 'origem' ? fluxo.fluxo.saidas : fluxo.fluxo.entradas) : []),
    [fluxo, modo],
  );
  const selecionadoCodigo = fluxo.tipo === 'pronto' ? fluxo.fluxo.municipio.codigoIbge7 : undefined;
  const arcosVisiveis = useMemo(
    () => (selecionadoCodigo ? montarArcos(modo, selecionadoCodigo, itens) : []),
    [modo, selecionadoCodigo, itens],
  );
  const arcosTop = useMemo(() => selecionarTopN(arcosVisiveis, top), [arcosVisiveis, top]);
  const polosExibidos = useMemo(
    () =>
      polos.tipo === 'pronto'
        ? selecionarTopN(
            polos.polos.map((p) => ({ ...p, valor: p.internacoesRecebidasDeFora })),
            top,
          )
        : [],
    [polos, top],
  );

  const municipiosNoMapa = useMemo<MunicipioNoMapa[]>(
    () => municipios.map((m) => ({ id: m.id, codigoIbge7: m.codigoIbge7, nome: m.nome, classificacao: null, indice: null })),
    [municipios],
  );

  /** Texto do tooltip de cada municipio envolvido - so os envolvidos ganham tom mais escuro no mapa. */
  const envolvidos = useMemo(() => {
    const mapa = new Map<string, string>();
    if (municipioId !== undefined && fluxo.tipo === 'pronto') {
      const nome = fluxo.fluxo.municipio.nome;
      for (const arco of arcosTop) {
        mapa.set(
          arco.contraparte,
          modo === 'origem'
            ? `${formatNumero(arco.valor)} internações de residentes de ${nome}`
            : `${formatNumero(arco.valor)} internações em ${nome}`,
        );
      }
    } else if (municipioId === undefined) {
      for (const polo of polosExibidos) {
        mapa.set(
          polo.municipio.codigoIbge7,
          `recebe ${formatNumero(polo.valor)} internações de ${polo.municipiosDeOrigem} municípios`,
        );
      }
    }
    return mapa;
  }, [municipioId, fluxo, arcosTop, polosExibidos, modo]);

  const corPorCodigo = useCallback(
    (codigo: string) => (envolvidos.has(codigo) || codigo === selecionadoCodigo ? 'fill-border-strong' : 'fill-surface-muted'),
    [envolvidos, selecionadoCodigo],
  );

  const tooltipPorCodigo = useCallback(
    (codigo: string, m: MunicipioNoMapa) => {
      const texto = envolvidos.get(codigo);
      if (texto) return `${m.nome}\n${texto}`;
      if (codigo === selecionadoCodigo) return `${m.nome}\nmunicípio selecionado`;
      return `${m.nome}\nclique para ver o fluxo`;
    },
    [envolvidos, selecionadoCodigo],
  );

  const polosNaCamada = useMemo(
    () => polosExibidos.map((p) => ({ codigoIbge7: p.municipio.codigoIbge7, nome: p.municipio.nome, valor: p.valor })),
    [polosExibidos],
  );

  const overlay = useCallback(
    (contexto: ContextoOverlay) => {
      if (municipioId !== undefined) {
        if (!selecionadoCodigo) return null;
        return (
          <CamadaFluxo
            arcos={arcosTop}
            centroideDe={contexto.centroideDe}
            unidadesPorPixel={contexto.unidadesPorPixel}
            selecionado={selecionadoCodigo}
            destacadoId={destacadoId}
          />
        );
      }
      return (
        <CamadaPolos polos={polosNaCamada} centroideDe={contexto.centroideDe} unidadesPorPixel={contexto.unidadesPorPixel} />
      );
    },
    [municipioId, selecionadoCodigo, arcosTop, destacadoId, polosNaCamada],
  );

  const anosDisponiveis = polos.tipo === 'pronto' ? polos.meta.anosDisponiveis : [];
  const anoExibido = polos.tipo === 'pronto' ? polos.meta.ano : null;
  const suprimidos = itens.filter((i) => i.suprimido).length;

  const legenda =
    municipioId === undefined ? (
      <p className="text-label text-muted-foreground">
        Área do círculo proporcional às internações recebidas de outros municípios ·{' '}
        <span className="tabular">{polosExibidos.length}</span> maiores polos
      </p>
    ) : (
      <p className="text-label text-muted-foreground">
        Espessura proporcional às internações · <span className="tabular">{arcosTop.length}</span> de{' '}
        <span className="tabular">{arcosVisiveis.length}</span> {modo === 'origem' ? 'destinos' : 'origens'} fora do
        município
        {suprimidos > 0 && (
          <>
            {' · '}
            <span className="tabular">{suprimidos}</span> par(es) suprimido(s) não desenhado(s)
          </>
        )}
      </p>
    );

  return (
    <>
      <PageHeader
        title="Fluxo Assistencial"
        description="Para onde os pacientes oncológicos de cada município vão se internar — e de onde vêm os que cada polo atende."
        actions={
          <FiltrosResponsivos quantidadeAtiva={quantidadeAtiva}>
            {anosDisponiveis.length > 0 && (
              <label className="flex shrink-0 items-center gap-1.5 text-caption text-muted-foreground">
                Ano
                <Select
                  value={anoExibido ?? ''}
                  onChange={(e) => setAno(Number(e.target.value) || undefined)}
                  aria-label="Ano"
                >
                  {anosDisponiveis.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            <label className="flex shrink-0 items-center gap-1.5 text-caption text-muted-foreground">
              Exibir
              <Select
                value={String(top)}
                onChange={(e) => setTop(e.target.value === 'todos' ? 'todos' : (Number(e.target.value) as TopN))}
                aria-label="Quantidade de fluxos exibidos"
              >
                {OPCOES_TOP.map((opcao) => (
                  <option key={String(opcao)} value={String(opcao)}>
                    {opcao === 'todos' ? 'Todos' : `Top ${opcao}`}
                  </option>
                ))}
              </Select>
            </label>
          </FiltrosResponsivos>
        }
      />
      <PageContent className="space-y-4">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-caption text-muted-foreground">
          SIH/SUS · internações oncológicas (C00–C97) · par município de residência → município de internação
          {anoExibido !== null && <> · {anoExibido}</>}
          {polos.tipo === 'pronto' && <ProvenanceBadge origem={polos.meta.origem} className="ml-1" />}
        </p>

        <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
          <div className="min-w-0 space-y-2">
            <MapaSP
              municipios={municipiosNoMapa}
              corPorCodigo={corPorCodigo}
              tooltipPorCodigo={tooltipPorCodigo}
              onClickMunicipio={(m) => selecionar(m.id, municipioId === undefined ? 'origem' : modo)}
              selecionadoId={municipioId ?? null}
              overlay={overlay}
              legenda={legenda}
            />
            <p className="text-caption leading-relaxed text-muted-foreground">
              {municipioId === undefined
                ? 'Clique num município para ver para onde vão os seus residentes, ou num polo da lista para ver de onde vêm os pacientes que ele atende.'
                : 'Pares com menos de 5 internações no ano são suprimidos por privacidade: não viram arco nem entram nos totais — o volume real é maior que o visível.'}
            </p>
          </div>

          <div className="min-w-0 space-y-3">
            <BuscaMunicipio municipios={municipios} onSelecionar={(id) => selecionar(id, modo)} />
            {municipioId === undefined ? (
              <PainelPolos estado={polos} polos={polosExibidos} onSelecionar={(id) => selecionar(id, 'destino')} />
            ) : (
              <PainelMunicipio
                estado={fluxo}
                modo={modo}
                top={top}
                itens={itens}
                arcosTop={arcosTop}
                totalVisiveis={arcosVisiveis.length}
                onModo={setModo}
                onVoltar={limparSelecao}
                onSelecionar={(id) => selecionar(id, modo === 'origem' ? 'destino' : 'origem')}
                onDestacar={setDestacadoId}
              />
            )}
          </div>
        </div>
      </PageContent>
    </>
  );
}

function BuscaMunicipio({
  municipios,
  onSelecionar,
}: {
  municipios: MunicipioResumoDTO[];
  onSelecionar: (municipioId: number) => void;
}) {
  const [texto, setTexto] = useState('');
  const sugestoes = useMemo(() => {
    const termo = normalizarBusca(texto);
    if (termo.length < 2) return [];
    return municipios.filter((m) => normalizarBusca(m.nome).includes(termo)).slice(0, 8);
  }, [texto, municipios]);

  return (
    <div className="relative">
      <Input
        type="search"
        icon={Search}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar município…"
        aria-label="Buscar município"
      />
      {sugestoes.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-surface shadow-md">
          {sugestoes.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-body text-foreground hover:bg-surface-muted"
                onClick={() => {
                  onSelecionar(m.id);
                  setTexto('');
                }}
              >
                {m.nome}
                <span className="ml-2 text-caption text-muted-foreground">{m.regiaoSaude.nome}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PainelPolos({
  estado,
  polos,
  onSelecionar,
}: {
  estado: EstadoPolos;
  polos: (PoloAtendimentoDTO & { valor: number })[];
  onSelecionar: (municipioId: number) => void;
}) {
  if (estado.tipo === 'carregando') return <LoadingState label="Carregando polos..." variant="panel" />;
  if (estado.tipo === 'erro') return <ErrorState description={estado.mensagem} />;
  if (polos.length === 0) return <EmptyState title="Nenhum fluxo carregado para este ano." />;

  return (
    <Card className="p-4">
      <h2 className="text-title-sm font-semibold text-foreground">Polos de atendimento</h2>
      <p className="mb-2 text-caption text-muted-foreground">
        Quem mais recebe pacientes de outros municípios. Clique para ver de onde eles vêm.
      </p>
      <div className="max-h-[460px] space-y-0.5 overflow-y-auto pr-1">
        {polos.map((polo, indice) => (
          <RankBar
            key={polo.municipio.id}
            posicao={indice + 1}
            nome={polo.municipio.nome}
            contexto={`de ${polo.municipiosDeOrigem} municípios`}
            valor={polo.valor}
            valorFormatado={formatNumero(polo.valor)}
            maximo={polos[0]?.valor ?? 0}
            onClick={() => onSelecionar(polo.municipio.id)}
          />
        ))}
      </div>
    </Card>
  );
}

function Numero({ rotulo, children, nota }: { rotulo: string; children: ReactNode; nota?: ReactNode }) {
  return (
    <div className="rounded-md border border-border p-2.5">
      <p className="text-label uppercase text-muted-foreground">{rotulo}</p>
      <div className="mt-0.5 text-title font-semibold text-foreground">{children}</div>
      {nota && <p className="mt-0.5 text-label text-muted-foreground">{nota}</p>}
    </div>
  );
}

function PainelMunicipio({
  estado,
  modo,
  top,
  itens,
  arcosTop,
  totalVisiveis,
  onModo,
  onVoltar,
  onSelecionar,
  onDestacar,
}: {
  estado: EstadoFluxo;
  modo: ModoFluxo;
  top: TopN;
  itens: FluxoItemDTO[];
  arcosTop: ArcoFluxo[];
  totalVisiveis: number;
  onModo: (modo: ModoFluxo) => void;
  onVoltar: () => void;
  onSelecionar: (municipioId: number) => void;
  onDestacar: (municipioId: number | null) => void;
}) {
  const voltar = (
    <button
      type="button"
      onClick={onVoltar}
      className="inline-flex items-center gap-1.5 rounded-md text-caption text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      Voltar aos polos
    </button>
  );

  if (estado.tipo === 'carregando' || estado.tipo === 'nenhum') {
    return (
      <Card className="space-y-3 p-4">
        {voltar}
        <LoadingState label="Carregando fluxo do município..." variant="panel" />
      </Card>
    );
  }
  if (estado.tipo === 'erro') {
    return (
      <Card className="space-y-3 p-4">
        {voltar}
        <ErrorState description={estado.mensagem} />
      </Card>
    );
  }
  if (estado.tipo === 'sem-ano') {
    return (
      <Card className="space-y-3 p-4">
        {voltar}
        <EmptyState title="Nenhum fluxo carregado para este ano." />
      </Card>
    );
  }

  const { fluxo } = estado;
  const suprimidos = itens.filter((i) => i.suprimido);

  return (
    <Card className="space-y-4 p-4">
      <div className="space-y-2">
        {voltar}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-title font-semibold text-foreground">{fluxo.municipio.nome}</h2>
          <div role="group" aria-label="Sentido do fluxo" className="inline-flex rounded-md border border-border p-0.5">
            {(['origem', 'destino'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={modo === m}
                onClick={() => onModo(m)}
                className={cn(
                  'rounded px-2.5 py-1 text-caption font-medium transition-colors',
                  modo === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {m === 'origem' ? 'Para onde vão' : 'De onde vêm'}
              </button>
            ))}
          </div>
        </div>
        <p className="text-caption text-muted-foreground">
          {modo === 'origem'
            ? `Internações de quem mora em ${fluxo.municipio.nome}, por município onde foram internados · ${fluxo.ano}`
            : `Internações realizadas em ${fluxo.municipio.nome}, por município onde o paciente mora · ${fluxo.ano}`}
        </p>
      </div>

      {itens.length === 0 ? (
        <EmptyState
          title={
            modo === 'origem'
              ? `Nenhuma internação oncológica registrada de residentes de ${fluxo.municipio.nome} em ${fluxo.ano}.`
              : `Nenhuma internação oncológica registrada em ${fluxo.municipio.nome} em ${fluxo.ano}.`
          }
          description="Sem registro no SIH/SUS para este recorte — é ausência de dado, não um valor suprimido."
          className="py-8"
        />
      ) : modo === 'origem' ? (
        <ResumoOrigem fluxo={fluxo} />
      ) : (
        <ResumoDestino itens={itens} />
      )}

      {arcosTop.length > 0 && (
        <div>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <h3 className="text-title-sm font-semibold text-foreground">
              {modo === 'origem' ? 'Destinos fora da cidade' : 'Municípios de origem'}
            </h3>
            <span className="tabular text-label text-muted-foreground">
              {top === 'todos' || arcosTop.length === totalVisiveis
                ? `${totalVisiveis} no total`
                : `${arcosTop.length} de ${totalVisiveis}`}
            </span>
          </div>
          <p className="mb-1.5 text-label text-muted-foreground">
            {modo === 'origem'
              ? 'Clique num destino para ver de onde vêm os pacientes que ele atende.'
              : 'Clique numa origem para ver para onde vão os seus residentes.'}
          </p>
          <div className="max-h-[360px] space-y-0.5 overflow-y-auto pr-1" onMouseLeave={() => onDestacar(null)}>
            {arcosTop.map((arco, indice) => (
              <div key={arco.municipioId} onMouseEnter={() => onDestacar(arco.municipioId)} onFocus={() => onDestacar(arco.municipioId)}>
                <RankBar
                  posicao={indice + 1}
                  nome={arco.rotulo}
                  valor={arco.valor}
                  valorFormatado={formatNumero(arco.valor)}
                  maximo={arcosTop[0]?.valor ?? 0}
                  onClick={() => onSelecionar(arco.municipioId)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {suprimidos.length > 0 && (
        <details className="rounded-md border border-dashed border-border px-3 py-2">
          <summary className="cursor-pointer text-caption text-muted-foreground">
            <span className="tabular font-medium text-foreground">{suprimidos.length}</span> par(es) suprimido(s) — menos de 5
            internações cada, fora do mapa e dos totais
          </summary>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {suprimidos.map((s) => (
              <li key={s.municipio.id} className="rounded-sm bg-unavailable-bg px-1.5 py-0.5 text-label text-muted-foreground">
                {s.municipio.nome}
              </li>
            ))}
          </ul>
        </details>
      )}

      <Link
        href={`/municipios/${fluxo.municipio.id}`}
        className="inline-flex items-center gap-1 text-caption text-primary hover:underline"
      >
        Ficha completa de {fluxo.municipio.nome}
        <ArrowRight className="h-3 w-3" aria-hidden />
      </Link>
    </Card>
  );
}

function ResumoOrigem({ fluxo }: { fluxo: FluxoMunicipioDTO }) {
  const { resumo } = fluxo;
  // Nenhum par visivel (nem o da propria cidade): o fluxo existe, mas todo ele
  // e menor que o limiar em cada par. Mostrar "0 internacoes" seria falso.
  if (resumo.internacoesVisiveis === 0 && resumo.paresSuprimidos > 0) {
    return (
      <SuppressedBlock
        tipo="suprimido"
        motivo={`Todo o fluxo de saída está suprimido: ${resumo.paresSuprimidos} par(es) com menos de 5 internações cada. As internações existem, mas nenhum par pode ser divulgado.`}
      />
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      <Numero rotulo="Internações visíveis" nota={`${resumo.destinosVisiveis} destino(s) visível(is)`}>
        <span className="tabular">{formatNumero(resumo.internacoesVisiveis)}</span>
      </Numero>
      <Numero rotulo="Na própria cidade">
        <span className="tabular">{formatNumero(resumo.internacoesNoProprioMunicipio)}</span>
      </Numero>
      <Numero
        rotulo="Fora da cidade"
        nota={
          resumo.taxaFluxoExternoVisivel === null ? undefined : (
            <>
              <span className="tabular">{(resumo.taxaFluxoExternoVisivel * 100).toFixed(1)}%</span> do visível ·{' '}
              <span className="uppercase tracking-wide">derivado</span>
            </>
          )
        }
      >
        <span className="tabular">{formatNumero(resumo.internacoesForaDoMunicipio)}</span>
      </Numero>
      <Numero rotulo="Pares suprimidos" nota="fora dos totais">
        <span className="tabular">{resumo.paresSuprimidos}</span>
      </Numero>
    </div>
  );
}

function ResumoDestino({ itens }: { itens: FluxoItemDTO[] }) {
  const resumo = resumirEntradas(itens);
  if (resumo.origensVisiveis === 0 && resumo.paresSuprimidos > 0 && resumo.residentesLocais === null) {
    return (
      <SuppressedBlock
        tipo="suprimido"
        motivo={`Recebe pacientes de ${resumo.paresSuprimidos} município(s), mas todos os pares têm menos de 5 internações e estão suprimidos.`}
      />
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      <Numero rotulo="Recebidas de fora" nota={`de ${resumo.origensVisiveis} município(s) visível(is)`}>
        {resumo.internacoesDeFora === null ? (
          <SuppressedValue tipo="suprimido" motivo="Nenhum par vindo de outro município é visível: todos têm menos de 5 internações." />
        ) : (
          <span className="tabular">{formatNumero(resumo.internacoesDeFora)}</span>
        )}
      </Numero>
      <Numero rotulo="Residentes locais">
        {resumo.residentesLocais !== null ? (
          <span className="tabular">{formatNumero(resumo.residentesLocais)}</span>
        ) : resumo.residentesLocaisSuprimido ? (
          <SuppressedValue tipo="suprimido" />
        ) : (
          <SuppressedValue tipo="sem-dado" motivo="Nenhuma internação de residentes na própria cidade neste ano." />
        )}
      </Numero>
      <Numero rotulo="Pares suprimidos" nota="fora dos totais">
        <span className="tabular">{resumo.paresSuprimidos}</span>
      </Numero>
    </div>
  );
}

export default function FluxoPage() {
  return (
    <Suspense fallback={<LoadingState label="Carregando..." variant="map" />}>
      <FluxoContent />
    </Suspense>
  );
}
