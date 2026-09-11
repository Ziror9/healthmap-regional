'use client';

import type { FluxoItemDTO, FluxoMunicipioDTO } from '@healthmap/contracts';
import { ArrowRight, Building2, MapPin } from 'lucide-react';
import Link from 'next/link';
import { formatNumero, formatPercentual } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Fluxo assistencial de um municipio (Fase 5.8): para onde vao os residentes
 * e de onde vem quem e atendido ali.
 *
 * Nao calcula nada - todos os numeros chegam prontos de GET /api/fluxo/
 * municipios/:id. Par suprimido aparece como "suprimido", nunca como 0, e a
 * taxa de deslocamento e rotulada como DERIVADA (nao e dado observado).
 */

function ListaFluxo({
  itens,
  vazioLabel,
  destaqueMesmoMunicipio,
}: {
  itens: FluxoItemDTO[];
  vazioLabel: string;
  destaqueMesmoMunicipio: string;
}) {
  if (itens.length === 0) {
    return <p className="py-3 text-xs text-muted-foreground">{vazioLabel}</p>;
  }

  return (
    <ul className="space-y-1">
      {itens.map((item) => (
        <li
          key={item.municipio.id}
          className={cn(
            'flex items-center justify-between gap-3 rounded-md border px-2.5 py-1.5',
            item.mesmoMunicipio ? 'border-primary/30 bg-primary/5' : 'border-border',
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm text-foreground">{item.municipio.nome}</span>
            {item.mesmoMunicipio && (
              <span className="shrink-0 rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {destaqueMesmoMunicipio}
              </span>
            )}
          </span>
          <span className="shrink-0 font-mono text-sm text-foreground">
            {item.suprimido || item.internacoes === null ? (
              <span className="text-xs font-sans text-muted-foreground">suprimido (n&lt;5)</span>
            ) : (
              formatNumero(item.internacoes)
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function FluxoPanel({ fluxo }: { fluxo: FluxoMunicipioDTO }) {
  const { resumo } = fluxo;
  const taxa = resumo.taxaFluxoExternoVisivel;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-border p-3">
          <p className="text-xs text-muted-foreground">Internações de residentes (visíveis)</p>
          <p className="mt-0.5 font-mono text-lg font-semibold text-foreground">
            {formatNumero(resumo.internacoesVisiveis)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {resumo.destinosVisiveis} destino(s) · {resumo.paresSuprimidos} par(es) suprimido(s)
          </p>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="text-xs text-muted-foreground">Atendidas no próprio município</p>
          <p className="mt-0.5 font-mono text-lg font-semibold text-foreground">
            {formatNumero(resumo.internacoesNoProprioMunicipio)}
          </p>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="text-xs text-muted-foreground">Atendidas fora do município</p>
          <p className="mt-0.5 font-mono text-lg font-semibold text-foreground">
            {formatNumero(resumo.internacoesForaDoMunicipio)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {taxa === null ? (
              'Sem volume visível para calcular proporção'
            ) : (
              <>
                <span className="font-medium">{formatPercentual(taxa)}</span> do volume visível ·{' '}
                <span className="uppercase tracking-wide">derivado</span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            Para onde vão os residentes
          </h4>
          <p className="mb-2 text-xs text-muted-foreground">
            Internações oncológicas de quem mora em {fluxo.municipio.nome}, por município de atendimento
          </p>
          <ListaFluxo
            itens={fluxo.saidas}
            vazioLabel="Nenhum fluxo de saída registrado neste ano."
            destaqueMesmoMunicipio="própria cidade"
          />
        </div>

        <div>
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            De onde vêm os pacientes atendidos aqui
          </h4>
          <p className="mb-2 text-xs text-muted-foreground">
            Internações realizadas em {fluxo.municipio.nome}, por município de residência
          </p>
          <ListaFluxo
            itens={fluxo.entradas}
            vazioLabel="Nenhuma internação registrada neste município neste ano."
            destaqueMesmoMunicipio="residentes locais"
          />
        </div>
      </div>

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
        <span>
          Fonte: SIH/SUS {fluxo.ano}, par município de residência → município de internação (C00-C97). Pares com menos
          de 5 internações no ano ficam suprimidos por privacidade e não entram nos totais — os valores acima cobrem
          apenas o fluxo visível, nunca o total real. A proporção de atendimento fora do município é um{' '}
          <strong>indicador derivado</strong> (divisão entre dois totais observados), não um dado publicado pelo
          DATASUS.
        </span>
      </p>

      <Link
        href={`/fluxo?municipio=${fluxo.municipio.id}`}
        className="inline-flex items-center gap-1 text-caption text-primary hover:underline"
      >
        Ver no mapa de fluxo
        <ArrowRight className="h-3 w-3" aria-hidden />
      </Link>
    </div>
  );
}
