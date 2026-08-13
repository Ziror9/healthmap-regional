import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import './globals.css';

/**
 * Tipografia: pilha de fontes do sistema, definida em globals.css. Decisao
 * deliberada - o build nao deve depender de download externo em tempo de
 * compilacao.
 *
 * Tema: claro por padrao (identidade enterprise definida na Fase 4, ver
 * docs/fase-4-relatorio.md). Nao ha alternancia de tema nesta fase - os
 * tokens de `.dark` nao sao aplicados.
 */
export const metadata: Metadata = {
  title: 'HealthMap Regional',
  description: 'Inteligencia territorial e Radar de Risco para saude publica regional',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <div className="flex min-h-screen flex-col md:flex-row">
          <Sidebar />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
