// Seeded, integer-based RNG. Same numbers on every device (only 32-bit integer
// ops, no Math.random, no float maths that could differ between engines).

/** Hash any number of integers into one unsigned 32-bit seed. */
export function hashInts(...nums) {
  let h = 0x811c9dc5;
  for (const n of nums) {
    h = Math.imul(h ^ (n | 0), 0x01000193) >>> 0;
    // fmix32 (murmur3 finaliser) so nearby inputs spread out.
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h ^= h >>> 16;
  }
  return h >>> 0;
}

/** mulberry32. `next()` in [0,1), `int(lo, hi)` inclusive, `pick(arr)`. */
export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  const pick = (arr) => arr[Math.floor(next() * arr.length)];
  return { next, int, pick };
}
