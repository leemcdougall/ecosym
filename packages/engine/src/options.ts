// Every number in the rules is a setting here (docs/rules.md names them).

export interface GeneRange {
  min: number;
  max: number;
  /** New worlds draw starting genes evenly from [lo, hi]. */
  start: [number, number];
}

export const ANIMAL_GENES = [
  "speed", "sight", "size", "lifespan", "maturity", "cooldown",
  "litter", "stamina", "attack", "defence", "boldness",
] as const;
export type AnimalGene = (typeof ANIMAL_GENES)[number];

export const PLANT_GENES = ["seedRate", "spread", "growth", "lifespan", "thorns"] as const;
export type PlantGene = (typeof PLANT_GENES)[number];

export type AnimalGeneRanges = Record<AnimalGene, GeneRange>;
export type PlantGeneRanges = Record<PlantGene, GeneRange>;

export interface WorldOptions {
  width: number;
  height: number;
  start: {
    plants: number; herbivores: number; carnivores: number;
    /** Starting plants' food, as a share of maxFood: [lo, hi]. */
    plantFood: [number, number];
    /** Starting animals' energy, as a share of max: [lo, hi]. */
    energy: [number, number];
    /** Starting ages go up to this share of lifespan (animals: at least maturity). */
    ageFraction: number;
  };
  /** world.touch: points of gap between edges that still count as touching. */
  touch: number;
  /** genes.mutate: changeable while the world runs. */
  mutation: { chance: number; size: number };
  maxAnimals: number;
  meatRot: number;
  plants: {
    cap: number;
    maxFood: number;
    seedFood: number;
    seedCost: number;
    sproutChance: number;
    thornGrowthCost: number;
    /** plants.grow never falls below this share of the growth gene. */
    minGrowth: number;
    radius: number;
    genes: PlantGeneRanges;
  };
  animals: {
    energyPerSize: number;
    healthPerSize: number;
    radiusBase: number;
    radiusPerSize: number;
    upkeep: {
      base: number; speed: number; move: number; sight: number;
      stamina: number; attack: number; defence: number;
    };
    staminaRecovery: number;
    regen: number;
    regenFedFactor: number;
    fedTicks: number;
    regenCost: number;
    starveDamage: number;
    meatPerSize: number;
    hungry: number;
    minPlantFood: number;
    plantDistanceWeight: number;
    bitePerSize: number;
    breedEnergy: number;
    breedCost: number;
    breedEfficiency: number;
    turnJitter: number;
    birthSpread: number;
  };
  herbivores: { genes: AnimalGeneRanges };
  carnivores: { genes: AnimalGeneRanges };
}

const animalGenes = (o: Partial<Record<AnimalGene, [number, number]>>): AnimalGeneRanges => {
  const base: AnimalGeneRanges = {
    speed: { min: 0.2, max: 5, start: [1.2, 1.8] },
    sight: { min: 5, max: 250, start: [50, 90] },
    size: { min: 0.4, max: 4, start: [0.9, 1.1] },
    lifespan: { min: 500, max: 20000, start: [4000, 6000] },
    maturity: { min: 50, max: 5000, start: [500, 800] },
    cooldown: { min: 30, max: 3000, start: [300, 500] },
    litter: { min: 1, max: 8, start: [1, 3] },
    stamina: { min: 0, max: 800, start: [60, 120] },
    attack: { min: 0, max: 15, start: [0, 1] },
    defence: { min: 0, max: 15, start: [0.5, 1.5] },
    boldness: { min: 0, max: 1, start: [0.3, 0.6] },
  };
  for (const [k, v] of Object.entries(o)) base[k as AnimalGene].start = v!;
  return base;
};

export function defaultOptions(): WorldOptions {
  return {
    width: 1600,
    height: 1000,
    start: { plants: 900, herbivores: 120, carnivores: 0, plantFood: [0.5, 1], energy: [0.6, 0.9], ageFraction: 0.5 },
    touch: 1,
    mutation: { chance: 0.1, size: 0.05 },
    maxAnimals: 4000,
    meatRot: 0.04,
    plants: {
      cap: 1600,
      maxFood: 60,
      seedFood: 5,
      seedCost: 10,
      sproutChance: 0.05,
      thornGrowthCost: 0.06,
      minGrowth: 0.1,
      radius: 2.5,
      genes: {
        seedRate: { min: 0.0002, max: 0.05, start: [0.003, 0.006] },
        spread: { min: 3, max: 150, start: [20, 40] },
        growth: { min: 0.01, max: 2, start: [0.15, 0.25] },
        lifespan: { min: 500, max: 40000, start: [6000, 10000] },
        thorns: { min: 0, max: 10, start: [0, 0] },
      },
    },
    animals: {
      energyPerSize: 100,
      healthPerSize: 50,
      radiusBase: 1.5,
      radiusPerSize: 2,
      upkeep: {
        base: 0.03, speed: 0.01, move: 0.02, sight: 0.0002,
        stamina: 0.00005, attack: 0.006, defence: 0.006,
      },
      staminaRecovery: 0.5,
      regen: 0.05,
      regenFedFactor: 4,
      fedTicks: 60,
      regenCost: 0.5,
      starveDamage: 0.2,
      meatPerSize: 60,
      hungry: 0.8,
      minPlantFood: 5,
      plantDistanceWeight: 10,
      bitePerSize: 3,
      breedEnergy: 0.6,
      breedCost: 0.25,
      breedEfficiency: 0.8,
      turnJitter: 0.3,
      birthSpread: 6,
    },
    herbivores: { genes: animalGenes({}) },
    carnivores: {
      genes: animalGenes({ speed: [1.4, 2.0], attack: [2, 4], sight: [70, 110] }),
    },
  };
}

/** Deep-merge partial settings over the defaults. */
export function makeOptions(over: DeepPartial<WorldOptions> = {}): WorldOptions {
  return merge(defaultOptions(), over) as WorldOptions;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] };

function merge(a: unknown, b: unknown): unknown {
  if (b === undefined) return a;
  if (typeof a !== "object" || a === null || Array.isArray(a) || typeof b !== "object" || b === null || Array.isArray(b)) return b;
  const out: Record<string, unknown> = { ...(a as Record<string, unknown>) };
  for (const [k, v] of Object.entries(b)) out[k] = merge(out[k], v);
  return out;
}
