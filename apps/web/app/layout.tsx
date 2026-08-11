import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

/**
 * Tipografia: a Fase 0 usa a pilha de fontes do sistema, definida em
 * globals.css. Decisao deliberada - o build da fundacao nao deve depender de
 * download externo em tempo de compilacao. A tipografia definitiva entra com o
 * design system, na Fase 4, com a fonte auto-hospedada.
 */
export const metadata: Metadata = {
  title: 'HealthMap Regional',
  description: 'Inteligencia analitica para saude regional',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
