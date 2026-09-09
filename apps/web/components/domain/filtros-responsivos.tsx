'use client';

import { SlidersHorizontal } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';

/**
 * Filtros inline no desktop, em painel deslizante no mobile.
 *
 * REDESIGN (E4): o diagnostico registrou que no mobile o cabecalho consumia
 * ~420px de uma tela de 812px antes do primeiro dado - metade da primeira
 * tela era controle. Aqui o custo cai para um botao de 32px que mostra
 * quantos filtros estao ativos.
 *
 * Os controles sao renderizados duas vezes (barra do desktop e painel do
 * mobile), mas a copia do painel so e montada quando ele esta aberto, e as
 * duas escrevem no MESMO estado - nao ha estado duplicado, so duas
 * superficies para o mesmo conjunto de controles.
 */
export function FiltrosResponsivos({
  children,
  quantidadeAtiva = 0,
  titulo = 'Filtros',
}: {
  children: ReactNode;
  /** Quantos filtros estao diferentes do padrao - exibido no botao do mobile. */
  quantidadeAtiva?: number;
  titulo?: string;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <div className="hidden items-center gap-2 md:flex">{children}</div>

      <Button
        variant="outline"
        size="sm"
        className="md:hidden"
        onClick={() => setAberto(true)}
        aria-haspopup="dialog"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
        {titulo}
        {quantidadeAtiva > 0 && (
          <span className="tabular ml-0.5 rounded-full bg-primary px-1.5 text-label text-primary-foreground">
            {quantidadeAtiva}
          </span>
        )}
      </Button>

      <Sheet aberto={aberto} onFechar={() => setAberto(false)} titulo={titulo}>
        <div className="flex flex-col gap-4">{children}</div>
      </Sheet>
    </>
  );
}
