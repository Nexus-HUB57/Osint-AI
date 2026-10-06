import type { LogEntry, LogLevel } from './contracts/types';

type Subscriber = (entry: LogEntry) => void;

export interface LoggerOptions {
  maxBuffer?:     number;
  consoleMirror?: boolean;
}

const pad = (n: number): string => n.toString().padStart(2, '0');

export class Logger {
  private counter = 0;
  private buffer: LogEntry[] = [];
  private readonly subscribers = new Set<Subscriber>();
  private readonly maxBuffer: number;

  public consoleMirror: boolean;

  constructor(options: LoggerOptions = {}) {
    this.maxBuffer = options.maxBuffer ?? 500;
    this.consoleMirror = options.consoleMirror ?? process.env.NODE_ENV === 'development';
  }

  private write(level: LogLevel, scope: string, message: string): LogEntry {
    const now = new Date();
    const hh = pad(now.getHours());
    const mm = pad(now.getMinutes());
    const ss = pad(now.getSeconds());

    const entry: LogEntry = {
      id: ++this.counter,
      level, scope, message,
      time: now.toISOString(),
      formatted: `[${hh}:${mm}:${ss}] [${scope}] ${message}`,
    };

    this.buffer.push(entry);
    if (this.buffer.length > this.maxBuffer) this.buffer.shift();

    if (this.consoleMirror && typeof console !== 'undefined') {
      const fn = level === 'error' ? console.error
               : level === 'warn'  ? console.warn
               :                     console.log;
      fn(entry.formatted);
    }

    for (const s of this.subscribers) {
      try { s(entry); } catch { /* isolamento */ }
    }

    return entry;
  }

  info   (scope: string, msg: string) { return this.write('info',    scope, msg); }
  warn   (scope: string, msg: string) { return this.write('warn',    scope, msg); }
  error  (scope: string, msg: string) { return this.write('error',   scope, msg); }
  success(scope: string, msg: string) { return this.write('success', scope, msg); }
  debug  (scope: string, msg: string) { return this.write('debug',   scope, msg); }

  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn);
    return () => { this.subscribers.delete(fn); };
  }

  snapshot(): readonly LogEntry[] { return [...this.buffer]; }
  clear(): void { this.buffer = []; }
}

export const logger = new Logger();
