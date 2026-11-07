import { bell, between, roll, type Dice } from "./dice.js";
import type { GeneRange } from "./options.js";

type Ranges<G extends string> = Record<G, GeneRange>;
type Genes<G extends string> = Record<G, number>;

/** world.start: genes drawn evenly from each start range. */
export function startGenes<G extends string>(dice: Dice, names: readonly G[], ranges: Ranges<G>): Genes<G> {
  const g = {} as Genes<G>;
  for (const n of names) g[n] = between(dice, ranges[n].start[0], ranges[n].start[1]);
  return g;
}

/** genes.inherit then genes.mutate. One parent (plants) passes b = a. */
export function childGenes<G extends string>(
  dice: Dice, names: readonly G[], ranges: Ranges<G>,
  a: Genes<G>, b: Genes<G>, mutation: { chance: number; size: number },
): Genes<G> {
  const g = {} as Genes<G>;
  for (const n of names) {
    let v = roll(dice) < 0.5 ? a[n] : b[n];
    if (roll(dice) < mutation.chance) {
      const r = ranges[n];
      v += bell(dice) * mutation.size * (r.max - r.min);
    }
    g[n] = clamp(v, ranges[n].min, ranges[n].max);
  }
  return g;
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
