import { performance } from 'node:perf_hooks';

/** One bounded, process-wide bucket; no attacker-controlled identifier map. */
export class TokenBucket {
  private tokens: number;
  private updatedAt: number;

  constructor(private readonly capacity: number, private readonly perMinute: number, private readonly now = () => performance.now()) {
    if (!Number.isFinite(capacity) || capacity < 1 || !Number.isFinite(perMinute) || perMinute <= 0) throw new Error('Invalid rate limit.');
    this.tokens = capacity;
    this.updatedAt = now();
  }

  take(): boolean {
    const current = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + Math.max(0, current - this.updatedAt) * this.perMinute / 60_000);
    this.updatedAt = current;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  get retryAfterSeconds(): number { return Math.ceil(60 / this.perMinute); }
}
