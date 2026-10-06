import type { Metadata } from 'next';
import './globals.css';
import { RecoveryModal } from '@/components/RecoveryModal';

export const metadata: Metadata = {
  title: 'OSINT-FUSION ENGINE',
  description: 'Agentes sincronizados: OSINT4ALL + CloudSINT',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-950 text-slate-100">
        {children}
        <RecoveryModal />
      </body>
    </html>
  );
}
