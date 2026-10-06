'use client';

import React from 'react';
import { AuthForm } from '@/components/AuthForm';
import { ShieldCheck } from 'lucide-react';

export default function SignupPage(): React.ReactElement {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6">
        <header className="flex items-center gap-3 border-b border-slate-800 pb-4">
          <ShieldCheck className="w-8 h-8 text-sky-400" />
          <div>
            <h1 className="text-xl font-bold">OSINT-FUSION</h1>
            <p className="text-xs text-slate-500">Crie sua identidade operacional</p>
          </div>
        </header>
        <AuthForm mode="register" />
      </div>
    </div>
  );
}