'use client';

import { ChevronRight, Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment } from 'react';
import { construirCrumbs } from '@/lib/navigation';

/**
 * Barra superior: trilha de navegacao e, no mobile, o gatilho do menu.
 *
 * Deliberadamente NAO repete o titulo da pagina - quem o exibe e o
 * PageHeader, logo abaixo. Duas barras dizendo "Radar Municipal" gastariam
 * duas linhas para uma informacao so.
 */
export function Topbar({ detalhe, onAbrirDrawer }: { detalhe: string | null; onAbrirDrawer: () => void }) {
  const pathname = usePathname();
  const crumbs = construirCrumbs(pathname, detalhe);
  const ultimo = crumbs.length - 1;

  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-surface/80 md:px-6">
      <button
        type="button"
        onClick={onAbrirDrawer}
        className="-ml-1 rounded-md p-2 text-muted-foreground hover:bg-surface-muted hover:text-foreground md:hidden"
        aria-label="Abrir menu de navegação"
      >
        <Menu className="h-4.5 w-4.5" aria-hidden />
      </button>

      <nav aria-label="Trilha de navegação" className="min-w-0">
        <ol className="flex min-w-0 items-center gap-1.5 text-caption">
          {crumbs.map((crumb, indice) => (
            <Fragment key={`${crumb.label}-${indice}`}>
              {indice > 0 && (
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" aria-hidden />
              )}
              <li className="min-w-0">
                {crumb.href && indice !== ultimo ? (
                  <Link
                    href={crumb.href}
                    className="rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className="block truncate font-medium text-foreground"
                    aria-current={indice === ultimo ? 'page' : undefined}
                  >
                    {crumb.label}
                  </span>
                )}
              </li>
            </Fragment>
          ))}
        </ol>
      </nav>
    </header>
  );
}
