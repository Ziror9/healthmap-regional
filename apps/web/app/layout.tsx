import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import './globals.css';

/**
 * Tipografia: pilha de fontes do sistema, definida em globals.css. Decisao
 * deliberada mantida no redesign - o build nao deve depender de download
 * externo em tempo de compilacao. Trocar por uma face propria e alterar
 * `--font-sans` (ver docs/design-system.md).
 *
 * Tema: claro por padrao. Nao ha alternancia de tema - os tokens de `.dark`
 * nao sao aplicados.
 *
 * A casca (navegacao lateral + barra superior) vive em AppShell, que e um
 * Client Component porque guarda estado de interface (drawer, colapso,
 * breadcrumb de detalhe). Este layout permanece Server Component.
 */
export const metadata: Metadata = {
  title: 'HealthMap Regional',
  description: 'Inteligencia territorial e Radar de Risco para saude publica regional',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
