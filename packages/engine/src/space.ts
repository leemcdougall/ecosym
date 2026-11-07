// world.wrap: the short way round on a world whose edges join up,
// and a grid of buckets for finding things near a point.

export function wrap(v: number, size: number): number {
  v %= size;
  if (v < 0) v += size;
  return v >= size ? 0 : v; // -1e-14 + size rounds to size

}

/** Shortest signed difference b - a on a loop of length size. */
export function delta(a: number, b: number, size: number): number {
  let d = b - a;
  if (d >= size || d <= -size) d %= size; // % only for far-apart inputs
  if (d > size / 2) d -= size;
  else if (d < -size / 2) d += size;
  return d;
}

export function distance(ax: number, ay: number, bx: number, by: number, w: number, h: number): number {
  return hypot2(delta(ax, bx, w), delta(ay, by, h));
}

/** Smallest distance from 0 to the span [lo, lo + len], also across the loop edge. */
function gap(lo: number, len: number, size: number, reach: number): number {
  const g = lo > 0 ? lo : lo + len < 0 ? -(lo + len) : 0;
  // Going the other way round is at least size - g - len; usually that is far.
  if (g <= reach || size - g - len > reach) return g;
  let best = g;
  for (let k = -1; k <= 1; k += 2) {
    const l = lo + k * size, hi = l + len;
    const e = l > 0 ? l : hi < 0 ? -hi : 0;
    if (e < best) best = e;
  }
  return best;
}

/**
 * Math.hypot(a, b) from basic maths and sqrt only, so it gives the same bits
 * on every engine, and the very same bits as V8's Math.hypot (the scaled,
 * compensated sum), so worlds made before this keep their seeds. Safari's
 * Math.hypot differs. A test compares it with Math.hypot here.
 */
export function hypot2(a: number, b: number): number {
  const x = a < 0 ? -a : a, y = b < 0 ? -b : b;
  const max = x > y ? x : y;
  if (max === 0) return 0;
  if (max !== max || max === Infinity) return Math.hypot(a, b);
  const nx = x / max, ny = y / max;
  // V8 adds the two squares with a compensation term; with only two terms
  // the first compensation is zero and the second is never used.
  return Math.sqrt(nx * nx + ny * ny) * max;
}

export interface Placed { x: number; y: number }

export class Grid<T extends Placed> {
  private cols: number;
  private rows: number;
  private cells: T[][];
  /** `drift`: the farthest anything can move after fill(); cells are searched with that much extra room. */
  constructor(private w: number, private h: number, private cell = 64, private drift = 0) {
    this.cols = Math.max(1, Math.floor(w / cell));
    this.rows = Math.max(1, Math.floor(h / cell));
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
  }
  private index(x: number, y: number): number {
    const c = Math.min(this.cols - 1, Math.floor((x / this.w) * this.cols));
    const r = Math.min(this.rows - 1, Math.floor((y / this.h) * this.rows));
    return r * this.cols + c;
  }
  fill(items: readonly T[]): void {
    for (const c of this.cells) c.length = 0;
    for (const it of items) this.cells[this.index(it.x, it.y)]!.push(it);
  }
  add(it: T): void {
    this.cells[this.index(it.x, it.y)]!.push(it);
  }
  /**
   * Calls fn for every item within radius of (x, y), with its distance.
   * (x, y) must be inside the world (wrapped): it picks the starting cell.
   */
  near(x: number, y: number, radius: number, fn: (it: T, d: number) => void): void {
    const cw = this.w / this.cols, ch = this.h / this.rows;
    const rc = Math.min(Math.ceil(radius / cw), Math.floor(this.cols / 2));
    const rr = Math.min(Math.ceil(radius / ch), Math.floor(this.rows / 2));
    const c0 = Math.floor((x / this.w) * this.cols);
    const r0 = Math.floor((y / this.h) * this.rows);
    const r2 = radius * radius * (1 + 1e-9); // cheap pre-check; the exact test is below
    // A cell repeats only when the count across is even and the search reaches
    // exactly half of it (the span is then count + 1). Skip the repeat (the
    // last one) so the order of calls stays the same.
    const lastDr = 2 * rr === this.rows ? rr - 1 : rr;
    const lastDc = 2 * rc === this.cols ? rc - 1 : rc;
    const { w, h, cols, rows } = this;
    const hw = w / 2, hh = h / 2;
    const reach = radius * (1 + 1e-9) + 1e-6;
    const far = reach + this.drift; // a cell's items may have moved since fill()
    for (let dr = -rr; dr <= lastDr; dr++) {
      const rawR = r0 + dr;
      const r = rawR < 0 ? rawR + rows : rawR >= rows ? rawR - rows : rawR;
      // Rows and columns that cannot hold anything in reach are skipped: they
      // would call nothing, so the order of calls stays the same.
      if (gap(rawR * ch - y, ch, h, far) > far) continue;
      for (let dc = -rc; dc <= lastDc; dc++) {
        const rawC = c0 + dc;
        if (gap(rawC * cw - x, cw, w, far) > far) continue;
        const c = rawC < 0 ? rawC + cols : rawC >= cols ? rawC - cols : rawC;
        const cell = this.cells[r * cols + c]!;
        for (let i = 0; i < cell.length; i++) {
          const it = cell[i]!;
          // delta without %: both coordinates are inside the world
          let dx = it.x - x, dy = it.y - y;
          if (dx > hw) dx -= w; else if (dx < -hw) dx += w;
          if (dy > hh) dy -= h; else if (dy < -hh) dy += h;
          if (dx * dx + dy * dy > r2) continue;
          const d = hypot2(dx, dy);
          if (d <= radius) fn(it, d);
        }
      }
    }
  }
}
