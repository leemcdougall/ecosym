// world.wrap: the short way round on a world whose edges join up,
// and a grid of buckets for finding things near a point.

export function wrap(v: number, size: number): number {
  v %= size;
  if (v < 0) v += size;
  return v >= size ? 0 : v; // -1e-14 + size rounds to size

}

/** Shortest signed difference b - a on a loop of length size. */
export function delta(a: number, b: number, size: number): number {
  let d = (b - a) % size;
  if (d > size / 2) d -= size;
  else if (d < -size / 2) d += size;
  return d;
}

export function distance(ax: number, ay: number, bx: number, by: number, w: number, h: number): number {
  return Math.hypot(delta(ax, bx, w), delta(ay, by, h));
}

export interface Placed { x: number; y: number }

export class Grid<T extends Placed> {
  private cols: number;
  private rows: number;
  private cells: T[][];
  constructor(private w: number, private h: number, private cell = 64) {
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
  /** Calls fn for every item within radius of (x, y), with its distance. */
  near(x: number, y: number, radius: number, fn: (it: T, d: number) => void): void {
    const cw = this.w / this.cols, ch = this.h / this.rows;
    const rc = Math.min(Math.ceil(radius / cw), Math.floor(this.cols / 2));
    const rr = Math.min(Math.ceil(radius / ch), Math.floor(this.rows / 2));
    const c0 = Math.floor((x / this.w) * this.cols);
    const r0 = Math.floor((y / this.h) * this.rows);
    const r2 = radius * radius * (1 + 1e-9); // cheap pre-check; the exact test is below
    // A cell is visited twice only when the loop spans an even count of cells;
    // skip the repeat (the last one) so the order of calls stays the same.
    const lastDr = 2 * rr === this.rows ? rr - 1 : rr;
    const lastDc = 2 * rc === this.cols ? rc - 1 : rc;
    for (let dr = -rr; dr <= lastDr; dr++) {
      const r = ((r0 + dr) % this.rows + this.rows) % this.rows;
      for (let dc = -rc; dc <= lastDc; dc++) {
        const c = ((c0 + dc) % this.cols + this.cols) % this.cols;
        for (const it of this.cells[r * this.cols + c]!) {
          const dx = delta(x, it.x, this.w), dy = delta(y, it.y, this.h);
          if (dx * dx + dy * dy > r2) continue;
          const d = Math.hypot(dx, dy);
          if (d <= radius) fn(it, d);
        }
      }
    }
  }
}
