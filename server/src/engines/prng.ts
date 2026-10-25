// Deterministic randomness for the simulator: string hash → mulberry32.

/** 32-bit FNV-1a with a murmur-style finalizer (good avalanche for short keys). */
export function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable pseudo-random number in [0, 1) for a key. */
export const unit = (key: string): number => hashStr(key) / 4294967296;

export class Rng {
  private readonly r: () => number;
  constructor(seed: string) {
    this.r = mulberry32(hashStr(seed));
  }
  next(): number {
    return this.r();
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.r();
  }
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
  chance(p: number): boolean {
    return this.r() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.r() * arr.length)]!;
  }
  /** Weighted sample of n distinct items. */
  sample<T>(items: readonly T[], n: number, weight: (t: T) => number = () => 1): T[] {
    const pool = items.map((item) => ({ item, w: Math.max(0, weight(item)) }));
    const out: T[] = [];
    while (out.length < n && pool.length) {
      const total = pool.reduce((s, p) => s + p.w, 0);
      let x = this.r() * (total || pool.length);
      let idx = pool.findIndex((p) => (x -= total ? p.w : 1) < 0);
      if (idx < 0) idx = pool.length - 1;
      out.push(pool.splice(idx, 1)[0]!.item);
    }
    return out;
  }
}
