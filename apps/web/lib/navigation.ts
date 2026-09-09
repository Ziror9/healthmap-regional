import { Activity, BarChart3, BookOpen, Info, type LucideIcon, Map as MapIcon, Radar } from 'lucide-react';

/**
 * Registro unico de navegacao - consumido pela Sidebar (lista) e pela Topbar
 * (breadcrumb). Antes a Sidebar era a unica fonte, e o breadcrumb nao existia;
 * duplicar os rotulos faria as duas divergirem na primeira renomeacao.
 *
 * A divisao em tres niveis (Situacao -> Analise -> Investigacao) e decisao de
 * produto da Fase 5.8, nao escolha estetica: reflete a sequencia de leitura
 * pretendida (o que esta acontecendo, onde esta acontecendo, e so entao o
 * detalhe e a metodologia). O redesign preserva.
 */
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGrupo {
  titulo: string;
  itens: NavItem[];
}

export const NAV_GRUPOS: NavGrupo[] = [
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

export const NAV_SECUNDARIA: NavItem[] = [{ href: '/sobre', label: 'Sobre', icon: Info }];

const TODOS_ITENS: NavItem[] = [...NAV_GRUPOS.flatMap((g) => g.itens), ...NAV_SECUNDARIA];

/** Item de navegacao correspondente a uma rota, ou `null` para rota nao registrada (ex.: detalhe dinamico). */
export function itemDaRota(pathname: string): NavItem | null {
  return TODOS_ITENS.find((item) => item.href === pathname) ?? null;
}

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Trilha de navegacao a partir do caminho. Segmento dinamico (ex.:
 * `/municipios/16`) resolve para a secao pai; o nome da entidade e informado
 * pela propria pagina via `useDetalheBreadcrumb` - o breadcrumb nunca exibe
 * um id cru, que nao diz nada a quem le.
 */
export function construirCrumbs(pathname: string, detalhe: string | null): Crumb[] {
  const item = itemDaRota(pathname);
  if (item) {
    return item.href === '/' ? [{ label: item.label }] : [{ label: 'Visão Geral', href: '/' }, { label: item.label }];
  }

  const secao = TODOS_ITENS.filter((i) => i.href !== '/').find((i) => pathname.startsWith(`${i.href}/`));
  const base: Crumb[] = [{ label: 'Visão Geral', href: '/' }];
  if (secao) base.push({ label: secao.label, href: secao.href });
  if (detalhe) base.push({ label: detalhe });
  return base;
}
