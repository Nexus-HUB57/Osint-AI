'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'lucide-react';
import { logger } from '@/lib/logger';
import type { LogEntry } from '@/lib/contracts/schemas';

interface ConsoleLogProps {
  title?: string;
  className?: string;
}

const LEVEL_CLASS: Record<LogEntry['level'], string> = {
  info:    'text-slate-300',
  warn:    'text-amber-300',
  error:   'text-red-400',
  success: 'text-emerald-400',
  debug:   'text-slate-500',
};

export function ConsoleLog({ title = 'Console', className = '' }: ConsoleLogProps): React.ReactElement {
  const [entries, setEntries] = useState<readonly LogEntry[]>([]);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsub = logger.subscribe((entry) => {
      setEntries((prev) => [...prev.slice(-200), entry]);
    });
    setEntries(logger.snapshot());
    return unsub;
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries]);

  return (
    <div className={`bg-slate-900 border border-slate-800 p-4 rounded-lg ${className}`}>
      <h2 className="text-xs font-bold text-slate-300 mb-3 flex items-center gap-2">
        <Terminal className="w-3.5 h-3.5 text-sky-400" /> {title}
      </h2>
      <div
        ref={ref}
        className="console-scroll bg-slate-950 border border-slate-800 rounded p-3 h-64 overflow-y-auto text-[11px] font-mono"
      >
        {entries.length === 0 ? (
          <p className="text-slate-600">aguardando eventos do agente…</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className={LEVEL_CLASS[entry.level]}>
              {entry.formatted}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default ConsoleLog;