'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

/**
 * Casca da aplicacao: navegacao lateral, barra superior e area de conteudo.
 *
 * Existe como componente cliente porque tres estados moram aqui e sao
 * compartilhados entre a Sidebar e a Topbar: o drawer no mobile, o colapso da
 * sidebar no desktop e o rotulo de detalhe do breadcrumb. Antes cada um deles
 * vivia dentro da Sidebar, que por isso precisava renderizar tambem a barra
 * superior do mobile - duas responsabilidades no mesmo componente.
 *
 * `app/layout.tsx` continua sendo Server Component: so monta esta casca.
 */
interface ShellContexto {
  /** Rotulo da entidade aberta (ex.: nome do municipio), para o ultimo nivel do breadcrumb. */
  detalhe: string | null;
  setDetalhe: (label: string | null) => void;
}

const ShellContext = createContext<ShellContexto | null>(null);

const CHAVE_COLAPSO = 'healthmap:sidebar-colapsada';

/**
 * Informa o ultimo nivel do breadcrumb a partir de uma pagina de detalhe.
 * Sem isso o breadcrumb mostraria o id da rota (`/municipios/16`), que nao
 * significa nada para quem le. Limpa ao desmontar.
 */
export function useDetalheBreadcrumb(label: string | null | undefined): void {
  const ctx = useContext(ShellContext);
  const setDetalhe = ctx?.setDetalhe;

  useEffect(() => {
    if (!setDetalhe) return;
    setDetalhe(label ?? null);
    return () => setDetalhe(null);
  }, [label, setDetalhe]);
}

export function AppShell({ children }: { children: ReactNode }) {
  const [drawerAberto, setDrawerAberto] = useState(false);
  const [colapsada, setColapsada] = useState(false);
  const [detalhe, setDetalhe] = useState<string | null>(null);

  // Preferencia de colapso persiste entre navegacoes e sessoes. Lida so no
  // cliente, depois da primeira pintura, para nao divergir do HTML do servidor.
  useEffect(() => {
    try {
      setColapsada(window.localStorage.getItem(CHAVE_COLAPSO) === '1');
    } catch {
      /* modo privado / storage bloqueado: segue expandida, que e o padrao */
    }
  }, []);

  const alternarColapso = useCallback(() => {
    setColapsada((atual) => {
      const proxima = !atual;
      try {
        window.localStorage.setItem(CHAVE_COLAPSO, proxima ? '1' : '0');
      } catch {
        /* preferencia nao persiste, mas a sessao atual continua funcionando */
      }
      return proxima;
    });
  }, []);

  const contexto = useMemo<ShellContexto>(() => ({ detalhe, setDetalhe }), [detalhe]);

  return (
    <ShellContext.Provider value={contexto}>
      <a href="#conteudo" className="skip-link">
        Pular para o conteúdo
      </a>
      <div className="flex min-h-screen">
        <Sidebar
          colapsada={colapsada}
          onAlternarColapso={alternarColapso}
          drawerAberto={drawerAberto}
          onFecharDrawer={() => setDrawerAberto(false)}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar detalhe={detalhe} onAbrirDrawer={() => setDrawerAberto(true)} />
          <main id="conteudo" className="min-w-0 flex-1">
            {children}
          </main>
        </div>
      </div>
    </ShellContext.Provider>
  );
}
