// In-memory token-bucket rate limiter (single process). Keys should be bounded (e.g. project ids, not raw input).

export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();

  /** `ratePerSec` tokens refill per second up to `burst`. */
  constructor(private readonly ratePerSec: number, private readonly burst: number, private readonly maxKeys = 10_000) {}

  /** Takes `cost` tokens for `key`. Returns 0 when allowed, else the seconds to wait before retrying. */
  take(key: string, cost = 1, now = Date.now()): number {
    let b = this.buckets.get(key);
    if (!b) {
      if (this.buckets.size >= this.maxKeys) this.buckets.clear(); // crude bound; buckets refill quickly anyway
      b = { tokens: this.burst, at: now };
      this.buckets.set(key, b);
    }
    b.tokens = Math.min(this.burst, b.tokens + ((now - b.at) / 1000) * this.ratePerSec);
    b.at = now;
    if (b.tokens >= cost) {
      b.tokens -= cost;
      return 0;
    }
    return Math.max(1, Math.ceil((cost - b.tokens) / this.ratePerSec));
  }
}
