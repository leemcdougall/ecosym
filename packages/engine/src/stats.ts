import { ANIMAL_GENES, PLANT_GENES, type AnimalGene, type PlantGene } from "./options.js";
import type { Kind, World } from "./world.js";

export interface KindStats<G extends string> {
  count: number;
  /** Average of each gene, or undefined when there are none. */
  average?: Record<G, number>;
  generation: number;
}

export function animalStats(w: World, kind: Kind): KindStats<AnimalGene> {
  const list = w.animals.filter((a) => a.kind === kind && !a.dead);
  return summarise(list, ANIMAL_GENES);
}

export function plantStats(w: World): KindStats<PlantGene> {
  return summarise(w.plants.filter((p) => !p.dead), PLANT_GENES);
}

function summarise<G extends string>(list: { genes: Record<G, number>; generation: number }[], names: readonly G[]): KindStats<G> {
  if (list.length === 0) return { count: 0, generation: 0 };
  const average = {} as Record<G, number>;
  for (const n of names) average[n] = list.reduce((s, x) => s + x.genes[n], 0) / list.length;
  const generation = Math.max(...list.map((x) => x.generation));
  return { count: list.length, average, generation };
}
