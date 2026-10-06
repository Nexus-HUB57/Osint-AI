import type { AssetFailure } from './schemas';

export * from './schemas';

export interface PurgeReport {
  storageCleared:             boolean;
  cachesDeleted:              number;
  serviceWorkersUnregistered: number;
  errors:                     string[];
}

export interface RecoveryState {
  readonly recoveryShown: boolean;
  readonly failures:      readonly AssetFailure[];
}

export interface BootDiagnostics {
  online:    boolean;
  userAgent: string;
  language:  string;
  storage: {
    localStorageLength:   number | null;
    sessionStorageLength: number | null;
  };
  serviceWorker: {
    supported:     boolean;
    controller:    string | null;
    registrations: number;
  };
  cacheNames: string[];
  timestamp:  string;
}
🔐 Criptografia
