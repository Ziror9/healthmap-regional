'use client';

import { Activity, BarChart3, BookOpen, Info, type LucideIcon, Map as MapIcon, Menu, Radar, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Navegacao em 3 niveis (Fase 5.8): situacao geral -> analise -> investigacao.
 * A ordem nao e estetica: reflete a sequencia de leitura pretendida (o que
 * esta acontecendo, onde esta acontecendo, e so entao o detalhe/metodologia).
 */
interface NavGrupo {
  titulo: string;
  itens: NavItem[];
}

const NAV_GRUPOS: NavGrupo[] = [
  {
    titulo: 'Situação',
    itens: [{ href: '/', label: 'Visão Geral', icon: BarChart3 }],
  },
  {
    titulo: 'Análise',
    itens: [
      { href: '/radar-municipal', label: 'Radar Municipal', icon: Radar },
      { href: '/radar', label: 'Radar de Risco', icon: Activity },
    ],
  },
  {
    titulo: 'Investigação',
    itens: [
      { href: '/municipios', label: 'Municípios', icon: MapIcon },
      { href: '/metodologia', label: 'Metodologia', icon: BookOpen },
    ],
  },
];

const NAV_SECUNDARIA: NavItem[] = [{ href: '/sobre', label: 'Sobre', icon: Info }];

function NavLink({ item, ativo, onNavigate }: { item: NavItem; ativo: boolean; onNavigate: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={ativo ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        ativo ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {item.label}
    </Link>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-4 py-5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Activity className="h-4.5 w-4.5" aria-hidden />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-foreground">HealthMap</p>
        <p className="text-[11px] text-muted-foreground">Regional</p>
      </div>
    </div>
  );
}

/**
 * Navegacao principal do produto. Fixa em desktop (md+), vira uma barra
 * superior com menu deslizante em telas menores. Nenhum item "Configuracoes"
 * - a plataforma nao tem nada configuravel pelo usuario nesta fase (RBAC e
 * inerte ate a Fase 6), um item morto seria pior do que a ausencia dele.
 */
export function Sidebar() {
  const pathname = usePathname();
  const [aberta, setAberta] = useState(false);

  const navegacao = (
    <nav className="flex-1 space-y-4 px-3">
      {NAV_GRUPOS.map((grupo) => (
        <div key={grupo.titulo} className="space-y-1">
          <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {grupo.titulo}
          </p>
          {grupo.itens.map((item) => (
            <NavLink key={item.href} item={item} ativo={pathname === item.href} onNavigate={() => setAberta(false)} />
          ))}
        </div>
      ))}
    </nav>
  );

  const rodape = (
    <div className="border-t border-border px-3 py-3">
      {NAV_SECUNDARIA.map((item) => (
        <NavLink key={item.href} item={item} ativo={pathname === item.href} onNavigate={() => setAberta(false)} />
      ))}
      <p className="mt-3 px-3 text-[11px] leading-relaxed text-muted-foreground">
        Ambiente de desenvolvimento
        <br />
        Dados REAL e DEMO coexistem — origem sempre identificada
      </p>
    </div>
  );

  return (
    <>
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Activity className="h-4 w-4" aria-hidden />
          </div>
          <span className="text-sm font-semibold text-foreground">HealthMap Regional</span>
        </div>
        <button
          type="button"
          onClick={() => setAberta(true)}
          className="rounded-md p-2 text-muted-foreground hover:bg-surface-muted"
          aria-label="Abrir menu de navegação"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <Brand />
        {navegacao}
        {rodape}
      </aside>

      {aberta && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Fechar menu de navegação"
            className="absolute inset-0 bg-foreground/30"
            onClick={() => setAberta(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-border bg-surface shadow-lg">
            <div className="flex items-center justify-between">
              <Brand />
              <button
                type="button"
                onClick={() => setAberta(false)}
                className="mr-3 rounded-md p-2 text-muted-foreground hover:bg-surface-muted"
                aria-label="Fechar menu de navegação"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            {navegacao}
            {rodape}
          </aside>
        </div>
      )}
    </>
  );
}
