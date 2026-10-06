'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { auditEngine } from '@/lib/audit/audit-engine';
import type { RecoveryState } from '@/lib/contracts/types';

export function RecoveryModal(): React.ReactElement | null {
  const [state, setState] = useState<RecoveryState>({ recoveryShown: false, failures: [] });

  useEffect(() => {
    const unsub = auditEngine.subscribe((s) => setState(s));
    setState(auditEngine.getState());
    return unsub;
  }, []);

  const handlePurge = useCallback(async () => {
    auditEngine.markRecoveryShown();
    await auditEngine.executePurge('manual');
  }, []);

  if (state.recoveryShown || state.failures.length === 0) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur"
    >
      <div className="bg-slate-900 border border-red-500/40 p-6 rounded-lg max-w-md w-full mx-4 shadow-2xl">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <h2 className="text-sm font-bold text-white">Ambiente instável detectado</h2>
          </div>
          <button
            type="button"
            onClick={() => auditEngine.markRecoveryShown()}
            aria-label="Fechar"
            className="text-slate-500 hover:text-slate-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Detectamos {state.failures.length} falha(s) de asset nesta sessão. Uma re-sincronização
          pode resolver inconsistências de cache ou service worker.
        </p>
        <button
          type="button"
          onClick={handlePurge}
          className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-2 rounded text-sm flex items-center justify-center gap-2 transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Re-sincronizar agora
        </button>
      </div>
    </div>
  );
}

export default RecoveryModal;