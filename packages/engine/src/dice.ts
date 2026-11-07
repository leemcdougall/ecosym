// dice.seed: one seeded stream (sfc32). Its state lives in the world, so
// the same seed and settings always give the same world.

export interface Dice { a: number; b: number; c: number; d: number }

export function makeDice(seed: number): Dice {
  const dice: Dice = { a: 0x9e3779b9, b: 0x243f6a88, c: 0xb7e15162, d: seed >>> 0 };
  for (let i = 0; i < 15; i++) roll(dice);
  return dice;
}

/** A number in [0, 1). */
export function roll(s: Dice): number {
  s.a >>>= 0; s.b >>>= 0; s.c >>>= 0; s.d >>>= 0;
  const t = (((s.a + s.b) | 0) + s.d) | 0;
  s.d = (s.d + 1) | 0;
  s.a = s.b ^ (s.b >>> 9);
  s.b = (s.c + (s.c << 3)) | 0;
  s.c = (s.c << 21) | (s.c >>> 11);
  s.c = (s.c + t) | 0;
  return (t >>> 0) / 4294967296;
}

export function between(s: Dice, lo: number, hi: number): number {
  return lo + (hi - lo) * roll(s);
}

/** Bell curve, mean 0, spread 1 (Box-Muller). */
export function bell(s: Dice): number {
  const u = 1 - roll(s);
  const v = roll(s);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
