'use client';

import React from 'react';
import { Database, Globe, Search, Shield } from 'lucide-react';

interface ToolItem {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TOOLS: readonly ToolItem[] = [
  { id: 'osint4all',   name: 'OSINT4ALL',   description: 'Mapeamento de pegada digital',     icon: Globe },
  { id: 'cloudsint',   name: 'CloudSINT',   description: 'Vetorização de credenciais',        icon: Database },
  { id: 'hybridcore',  name: 'HybridCore',  description: 'Fusão & scoring corroborativo',      icon: Search },
  { id: 'recovery',    name: 'AutoRecovery',description: 'Purga atômica de caches + SW reset', icon: Shield },
];

interface ToolkitGridProps {
  className?: string;
}

export function ToolkitGrid({ className = '' }: ToolkitGridProps): React.ReactElement {
  return (
    <div className={`bg-slate-900 border border-slate-800 p-4 rounded-lg ${className}`}>
      <h2 className="text-xs font-bold text-slate-300 mb-3 flex items-center gap-2">
        <Shield className="w-3.5 h-3.5 text-sky-400" /> Toolkit do Agente
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              type="button"
              className="p-3 bg-slate-950 border border-slate-800 rounded text-left hover:border-sky-500/40 transition-colors"
            >
              <Icon className="w-4 h-4 text-sky-400 mb-1" />
              <p className="text-[11px] font-bold text-white">{tool.name}</p>
              <p className="text-[10px] text-slate-500">{tool.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default ToolkitGrid;