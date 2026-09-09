'use client';

import { Activity, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_GRUPOS, NAV_SECUNDARIA, type NavItem } from '@/lib/navigation';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Navegacao principal. Fixa no desktop (md+), drawer no mobile.
 *
 * REDESIGN (E1): passou a colapsar para 64px (so icones), com a preferencia
 * persistida - numa tela de analise territorial, largura horizontal e o
 * recurso mais escasso, e o mapa e o maior beneficiado. O estado do drawer e
 * do colapso vem do AppShell; este componente so desenha.
 *
 * Continua sem item "Configuracoes": nada e configuravel pelo usuario nesta
 * fase (RBAC inerte ate a Fase 6), e um item morto e pior que a ausencia.
 */
function NavLink({
  item,
  ativo,
  colapsada,
  onNavigate,
}: {
  item: NavItem;
  ativo: boolean;
  colapsada: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;

  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={ativo ? 'page' : undefined}
      title={colapsada ? undefined : item.label}
      className={cn(
        'relative flex items-center gap-3 rounded-md py-2 text-body font-medium transition-colors',
        colapsada ? 'justify-center px-0' : 'px-3',
        ativo
          ? 'bg-surface-muted text-foreground'
          : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground',
      )}
    >
      {/* Marcador do item ativo: o vermelho institucional aparece aqui como
          identidade/estado de navegacao - nunca como valor de dado. */}
      {ativo && <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary" aria-hidden />}
      <Icon className={cn('h-4 w-4 shrink-0', ativo && 'text-primary')} aria-hidden />
      {!colapsada && <span className="truncate">{item.label}</span>}
      {colapsada && <span className="sr-only">{item.label}</span>}
    </Link>
  );

  return colapsada ? <Tooltip label={item.label}>{link}</Tooltip> : link;
}

function Brand({ colapsada }: { colapsada: boolean }) {
  return (
    <Link
      href="/"
      className={cn('flex items-center gap-2.5 rounded-md py-4', colapsada ? 'justify-center px-0' : 'px-3')}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Activity className="h-4 w-4" aria-hidden />
      </span>
      {!colapsada && (
        <span className="leading-tight">
          <span className="block text-title-sm font-semibold text-foreground">HealthMap</span>
          <span className="block text-label uppercase text-muted-foreground">Regional</span>
        </span>
      )}
      <span className="sr-only">HealthMap Regional — ir para a Visão Geral</span>
    </Link>
  );
}

function Conteudo({
  colapsada,
  onNavigate,
  onAlternarColapso,
}: {
  colapsada: boolean;
  onNavigate: () => void;
  onAlternarColapso?: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      <Brand colapsada={colapsada} />

      <nav aria-label="Navegação principal" className="flex-1 space-y-5 px-2">
        {NAV_GRUPOS.map((grupo) => (
          <div key={grupo.titulo} className="space-y-0.5">
            {colapsada ? (
              <div className="mx-auto mb-1.5 h-px w-6 bg-border" aria-hidden />
            ) : (
              <p className="px-3 pb-1 text-label uppercase text-muted-foreground/80">{grupo.titulo}</p>
            )}
            {grupo.itens.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                ativo={pathname === item.href}
                colapsada={colapsada}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-border px-2 py-2">
        {NAV_SECUNDARIA.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            ativo={pathname === item.href}
            colapsada={colapsada}
            onNavigate={onNavigate}
          />
        ))}

        {onAlternarColapso && (
          <button
            type="button"
            onClick={onAlternarColapso}
            aria-expanded={!colapsada}
            className={cn(
              'hidden w-full items-center gap-3 rounded-md py-2 text-body font-medium text-muted-foreground',
              'transition-colors hover:bg-surface-muted hover:text-foreground md:flex',
              colapsada ? 'justify-center px-0' : 'px-3',
            )}
          >
            {colapsada ? (
              <PanelLeftOpen className="h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <PanelLeftClose className="h-4 w-4 shrink-0" aria-hidden />
            )}
            {!colapsada && <span>Recolher</span>}
            <span className="sr-only">{colapsada ? 'Expandir navegação' : 'Recolher navegação'}</span>
          </button>
        )}

        {!colapsada && (
          <p className="px-3 pb-1 pt-2 text-label leading-relaxed text-muted-foreground">
            Ambiente de desenvolvimento
            <br />
            Análises sobre dados REAL
          </p>
        )}
      </div>
    </>
  );
}

export function Sidebar({
  colapsada,
  onAlternarColapso,
  drawerAberto,
  onFecharDrawer,
}: {
  colapsada: boolean;
  onAlternarColapso: () => void;
  drawerAberto: boolean;
  onFecharDrawer: () => void;
}) {
  return (
    <>
      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 md:flex',
          colapsada ? 'w-16' : 'w-56',
        )}
      >
        <Conteudo colapsada={colapsada} onNavigate={() => {}} onAlternarColapso={onAlternarColapso} />
      </aside>

      {drawerAberto && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Fechar menu de navegação"
            className="absolute inset-0 bg-foreground/40"
            onClick={onFecharDrawer}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-border bg-surface shadow-md">
            <button
              type="button"
              onClick={onFecharDrawer}
              className="absolute right-2 top-4 rounded-md p-2 text-muted-foreground hover:bg-surface-muted"
              aria-label="Fechar menu de navegação"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
            <Conteudo colapsada={false} onNavigate={onFecharDrawer} />
          </aside>
        </div>
      )}
    </>
  );
}
