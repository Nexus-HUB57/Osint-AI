'use client';

import React, { useState } from 'react';
import {
  ArrowRight,
  Building,
  Eye,
  Lock,
  Mail,
  ShieldAlert,
  User,
  CheckCircle2,
} from 'lucide-react';

export type AuthFormMode = 'register' | 'login';

interface AuthFormProps {
  mode?: AuthFormMode;
  turnstileSiteKey?: string;
  onSuccess?: (response: { user: unknown; token: string }) => void;
}

export function AuthForm({
  mode: initialMode = 'register',
  turnstileSiteKey,
  onSuccess,
}: AuthFormProps): React.ReactElement {
  const [mode, setMode] = useState<AuthFormMode>(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const [firstName, setFirstName]   = useState('');
  const [lastName, setLastName]     = useState('');
  const [organization, setOrg]      = useState('');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [showPassword, setShow]     = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { email, password };
      if (mode === 'register') {
        body.firstName = firstName;
        body.lastName = lastName;
        body.organization = organization;
      }
      // Placeholder — real impl wires TURNSTILE_TOKEN from the page that embeds AuthForm.
      void turnstileSiteKey;

      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { user?: unknown; token?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'request_failed');
        return;
      }
      setOk(true);
      onSuccess?.({ user: data.user, token: data.token ?? '' });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (ok) {
    return (
      <div className="bg-slate-900 border border-emerald-800/40 p-6 rounded-lg text-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
        <h2 className="text-sm font-bold text-white mb-1">Sessão autorizada</h2>
        <p className="text-xs text-slate-400">
          Token VoidAccess emitido para {email}.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 p-6 rounded-lg space-y-4">
      <header className="flex items-center gap-2">
        <ShieldAlert className="w-5 h-5 text-sky-400" />
        <h2 className="text-sm font-bold text-white">
          {mode === 'register' ? 'Criar conta' : 'Entrar'}
        </h2>
      </header>

      {mode === 'register' && (
        <>
          <Field icon={User} label="Nome" value={firstName} onChange={setFirstName} required />
          <Field icon={User} label="Sobrenome" value={lastName} onChange={setLastName} required />
          <Field icon={Building} label="Organização" value={organization} onChange={setOrg} required />
        </>
      )}

      <Field icon={Mail} label="E-mail" type="email" value={email} onChange={setEmail} required />

      <Field
        icon={Lock}
        label="Senha"
        type={showPassword ? 'text' : 'password'}
        value={password}
        onChange={setPassword}
        required
        suffix={
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label="Alternar visibilidade da senha"
            className="text-slate-500 hover:text-slate-300"
          >
            <Eye className="w-4 h-4" />
          </button>
        }
      />

      {error && (
        <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-slate-950 font-bold py-2 rounded text-sm flex items-center justify-center gap-2"
      >
        {mode === 'register' ? 'Registrar' : 'Entrar'} <ArrowRight className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={() => setMode(mode === 'register' ? 'login' : 'register')}
        className="w-full text-xs text-slate-500 hover:text-slate-300"
      >
        {mode === 'register' ? 'Já tem conta? Entrar' : 'Não tem conta? Registrar'}
      </button>
    </form>
  );
}

interface FieldProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  suffix?: React.ReactNode;
}

function Field({ icon: Icon, label, value, onChange, type = 'text', required, suffix }: FieldProps) {
  return (
    <label className="block">
      <span className="text-[11px] text-slate-400 mb-1 block">{label}</span>
      <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded px-3 py-2 focus-within:border-sky-500">
        <Icon className="w-4 h-4 text-slate-500" />
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          className="flex-1 bg-transparent text-sm text-white focus:outline-none"
        />
        {suffix}
      </div>
    </label>
  );
}

export default AuthForm;