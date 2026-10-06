export type Tags = Record<string, string | number | boolean>;

export interface MetricsSink {
  counter(name: string, value?: number, tags?: Tags): void;
  histogram(name: string, valueMs: number, tags?: Tags): void;
  gauge(name: string, value: number, tags?: Tags): void;
}

export class InMemoryMetrics implements MetricsSink {
  private c = new Map<string, number>();
  private h = new Map<string, number[]>();
  private g = new Map<string, number>();

  private key(name: string, tags?: Tags): string {
    if (!tags) return name;
    const t = Object.keys(tags).sort().map((k) => `${k}=${tags[k]}`).join(',');
    return `${name}{${t}}`;
  }

  counter(name: string, value = 1, tags?: Tags): void {
    const k = this.key(name, tags);
    this.c.set(k, (this.c.get(k) ?? 0) + value);
  }

  histogram(name: string, valueMs: number, tags?: Tags): void {
    const k = this.key(name, tags);
    const arr = this.h.get(k) ?? [];
    arr.push(valueMs);
    this.h.set(k, arr);
  }

  gauge(name: string, value: number, tags?: Tags): void {
    this.g.set(this.key(name, tags), value);
  }

  snapshot() {
    return {
      counters: Object.fromEntries(this.c),
      gauges: Object.fromEntries(this.g),
      histograms: Object.fromEntries(
        [...this.h.entries()].map(([k, xs]) => {
          const sorted = [...xs].sort((a, b) => a - b);
          const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
          return [k, { count: xs.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: sorted.at(-1) ?? 0 }];
        }),
      ),
    };
  }
}

export const noopMetrics: MetricsSink = {
  counter: () => {}, histogram: () => {}, gauge: () => {},
};

export const metrics: MetricsSink = new InMemoryMetrics();
