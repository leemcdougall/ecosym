import { describe, expect, it } from "vitest";
import {
  ANIMAL_GENES, childGenes, createWorld, defaultOptions, delta, distance, Grid, makeDice,
  maxEnergy, maxHealth, roll, step, wrap, type Animal, type Plant, type World,
} from "../src/index.js";

/** An empty world: no plants, no animals, no sprouts. */
function empty(over: Parameters<typeof createWorld>[1] = {}): World {
  return createWorld(1, { start: { plants: 0, herbivores: 0, carnivores: 0 }, plants: { sproutChance: 0 }, ...over });
}

/** Put one herbivore with start-average genes into the world. */
function addHerbivore(w: World, x: number, y: number, genes: Partial<Animal["genes"]> = {}): Animal {
  const r = w.options.herbivores.genes;
  const g = Object.fromEntries(ANIMAL_GENES.map((n) => [n, (r[n].start[0] + r[n].start[1]) / 2])) as Animal["genes"];
  const a: Animal = {
    id: w.nextId++, kind: "herbivore", x, y, heading: 0, genes: { ...g, ...genes },
    energy: 0, health: 0, age: 0, stamina: 0, cooldown: 0, fed: 0, generation: 0,
    activity: "wander", moved: 0, dead: false,
  };
  a.energy = maxEnergy(w, a) / 2;
  a.health = maxHealth(w, a);
  a.stamina = a.genes.stamina;
  w.animals.push(a);
  return a;
}

function addPlant(w: World, x: number, y: number, food: number, genes: Partial<Plant["genes"]> = {}): Plant {
  const p: Plant = {
    id: w.nextId++, x, y, food, age: 0, generation: 0, dead: false,
    genes: { seedRate: 0, spread: 20, growth: 0, lifespan: 1e9, thorns: 0, ...genes },
  };
  w.plants.push(p);
  return p;
}

describe("world", () => {
  it("world.wrap: positions wrap and distances take the short way round", () => {
    expect(wrap(-1, 100)).toBe(99);
    expect(wrap(101, 100)).toBe(1);
    expect(delta(95, 5, 100)).toBe(10);
    expect(delta(5, 95, 100)).toBe(-10);
    expect(distance(1, 1, 99, 99, 100, 100)).toBeCloseTo(Math.SQRT2 * 2);
  });

  it("world.wrap: an animal walking off the right edge comes in on the left", () => {
    const w = empty();
    const a = addHerbivore(w, w.options.width - 0.1, 500);
    a.heading = 0;
    step(w);
    expect(a.x).toBeLessThan(5);
  });

  it("world.wrap: the grid finds things across the edge", () => {
    const g = new Grid<{ x: number; y: number }>(1000, 1000);
    g.fill([{ x: 995, y: 500 }, { x: 500, y: 500 }]);
    const found: number[] = [];
    g.near(3, 500, 20, (_, d) => found.push(d));
    expect(found).toHaveLength(1);
    expect(found[0]).toBeCloseTo(8);
  });

  it("world.start: a new world has the starting numbers", () => {
    const w = createWorld(7);
    const o = defaultOptions();
    expect(w.plants).toHaveLength(o.start.plants);
    expect(w.animals.filter((a) => a.kind === "herbivore")).toHaveLength(o.start.herbivores);
    for (const a of w.animals) expect(a.age).toBeGreaterThanOrEqual(a.genes.maturity);
  });
});

describe("dice", () => {
  it("dice.seed: the same seed gives the same world, tick for tick", () => {
    const a = createWorld(42), b = createWorld(42);
    for (let i = 0; i < 300; i++) { step(a); step(b); }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("dice.seed: a different seed gives a different world", () => {
    const a = createWorld(1), b = createWorld(2);
    expect(a.plants[0]!.x).not.toBe(b.plants[0]!.x);
  });

  it("dice.seed: rolls are in [0, 1)", () => {
    const d = makeDice(3);
    for (let i = 0; i < 10000; i++) { const r = roll(d); expect(r).toBeGreaterThanOrEqual(0); expect(r).toBeLessThan(1); }
  });
});

describe("genes", () => {
  const ranges = defaultOptions().herbivores.genes;
  const a = Object.fromEntries(ANIMAL_GENES.map((n) => [n, ranges[n].min])) as Animal["genes"];
  const b = Object.fromEntries(ANIMAL_GENES.map((n) => [n, ranges[n].max])) as Animal["genes"];

  it("genes.inherit: with no mutation each gene comes whole from one parent", () => {
    const d = makeDice(5);
    let fromA = 0, total = 0;
    for (let i = 0; i < 200; i++) {
      const c = childGenes(d, ANIMAL_GENES, ranges, a, b, { chance: 0, size: 0.1 });
      for (const n of ANIMAL_GENES) {
        expect([a[n], b[n]]).toContain(c[n]);
        if (c[n] === a[n]) fromA++;
        total++;
      }
    }
    expect(fromA / total).toBeGreaterThan(0.45);
    expect(fromA / total).toBeLessThan(0.55);
  });

  it("genes.mutate: changes stay inside min and max", () => {
    const d = makeDice(6);
    for (let i = 0; i < 200; i++) {
      const c = childGenes(d, ANIMAL_GENES, ranges, a, b, { chance: 1, size: 1 });
      for (const n of ANIMAL_GENES) {
        expect(c[n]).toBeGreaterThanOrEqual(ranges[n].min);
        expect(c[n]).toBeLessThanOrEqual(ranges[n].max);
      }
    }
  });

  it("genes.mutate: the chance setting controls how often genes change", () => {
    const d = makeDice(7);
    const mid = Object.fromEntries(ANIMAL_GENES.map((n) => [n, (ranges[n].min + ranges[n].max) / 2])) as Animal["genes"];
    let changed = 0, total = 0;
    for (let i = 0; i < 500; i++) {
      const c = childGenes(d, ANIMAL_GENES, ranges, mid, mid, { chance: 0.2, size: 0.01 });
      for (const n of ANIMAL_GENES) { if (c[n] !== mid[n]) changed++; total++; }
    }
    expect(changed / total).toBeGreaterThan(0.17);
    expect(changed / total).toBeLessThan(0.23);
  });
});

describe("plants", () => {
  it("plants.grow: a plant grows its growth gene each tick, up to maxFood", () => {
    const w = empty();
    const p = addPlant(w, 100, 100, 10, { growth: 0.5 });
    step(w);
    expect(p.food).toBeCloseTo(10.5);
    p.food = w.options.plants.maxFood - 0.1;
    step(w);
    expect(p.food).toBe(w.options.plants.maxFood);
  });

  it("plants.grow: thorns slow growth, never below a tenth", () => {
    const w = empty();
    const p = addPlant(w, 100, 100, 10, { growth: 1, thorns: 5 });
    const q = addPlant(w, 300, 100, 10, { growth: 1, thorns: 10 * 10 });
    step(w);
    expect(p.food).toBeCloseTo(10 + 1 - w.options.plants.thornGrowthCost * 5);
    expect(q.food).toBeCloseTo(10.1);
  });

  it("plants.seed: a full plant seeds within its spread, paying seedCost", () => {
    const w = empty();
    const o = w.options.plants;
    const p = addPlant(w, 500, 500, o.maxFood, { seedRate: 1, spread: 30 });
    step(w);
    expect(w.plants).toHaveLength(2);
    const seed = w.plants[1]!;
    expect(distance(500, 500, seed.x, seed.y, w.options.width, w.options.height)).toBeLessThanOrEqual(30 + 1e-9);
    expect(seed.food).toBe(o.seedFood);
    expect(seed.generation).toBe(1);
    expect(p.food).toBe(o.maxFood - o.seedCost);
  });

  it("plants.seed: no seeds once the world holds cap plants", () => {
    const w = empty({ plants: { cap: 1 } });
    addPlant(w, 500, 500, w.options.plants.maxFood, { seedRate: 1 });
    step(w);
    expect(w.plants).toHaveLength(1);
  });

  it("plants.sprout: plants appear at random when sproutChance is 1", () => {
    const w = empty({ plants: { sproutChance: 1 } });
    step(w);
    expect(w.plants).toHaveLength(1);
    expect(w.plants[0]!.generation).toBe(0);
  });

  it("plants.die: a plant dies of old age", () => {
    const w = empty();
    addPlant(w, 100, 100, 10, { lifespan: 1 });
    step(w);
    step(w);
    expect(w.plants).toHaveLength(0);
  });
});

describe("animals", () => {
  it("animals.upkeep: energy falls by the upkeep formula", () => {
    const w = empty();
    const a = addHerbivore(w, 500, 500);
    a.energy = maxEnergy(w, a); // full: not hungry, so it wanders at cruising speed
    a.age = 0; // too young to breed
    const before = a.energy;
    step(w);
    const u = w.options.animals.upkeep, g = a.genes, v = g.speed / 2;
    const cost = u.base * g.size + u.speed * g.speed * g.size + u.move * g.size * v * v
      + u.sight * g.sight + u.stamina * g.stamina + u.attack * g.attack + u.defence * g.defence;
    expect(before - a.energy).toBeCloseTo(cost, 9);
  });

  it("animals.upkeep: a faster animal pays more", () => {
    const w = empty();
    const slow = addHerbivore(w, 100, 100, { speed: 1 });
    const fast = addHerbivore(w, 900, 900, { speed: 3 });
    for (const a of [slow, fast]) a.energy = maxEnergy(w, a);
    step(w);
    expect(maxEnergy(w, fast) - fast.energy).toBeGreaterThan(maxEnergy(w, slow) - slow.energy);
  });

  it("animals.starve: no energy means losing health, then death and meat", () => {
    const w = empty();
    const a = addHerbivore(w, 500, 500, { size: 1 });
    a.energy = 0;
    a.health = w.options.animals.starveDamage * 2.5;
    step(w);
    expect(a.health).toBeCloseTo(w.options.animals.starveDamage * 1.5);
    step(w);
    step(w);
    expect(a.dead).toBe(true);
    expect(a.cause).toBe("starved");
    expect(w.animals).toHaveLength(0);
    expect(w.meat).toHaveLength(1);
    expect(w.meat[0]!.food).toBeCloseTo(w.options.animals.meatPerSize - w.options.meatRot);
  });

  it("animals.death: an animal dies of old age", () => {
    const w = empty();
    const a = addHerbivore(w, 500, 500, { lifespan: 10 });
    a.age = 10;
    step(w);
    expect(a.cause).toBe("old age");
  });

  it("animals.health: health recovers, faster after eating, costing energy", () => {
    const w = empty();
    const ao = w.options.animals;
    const a = addHerbivore(w, 500, 500);
    a.energy = maxEnergy(w, a);
    a.health = 1;
    step(w);
    expect(a.health).toBeCloseTo(1 + ao.regen);
    a.fed = 10;
    step(w);
    expect(a.health).toBeCloseTo(1 + ao.regen + ao.regen * ao.regenFedFactor);
  });

  it("animals.wander: with nothing to do it moves at cruising speed", () => {
    const w = empty();
    const a = addHerbivore(w, 500, 500);
    a.energy = maxEnergy(w, a);
    step(w);
    expect(a.moved).toBeCloseTo(a.genes.speed / 2);
    expect(a.activity).toBe("wander");
  });
});

describe("eating", () => {
  it("eat.plant: a hungry herbivore walks to a plant in sight and eats it", () => {
    const w = empty();
    const a = addHerbivore(w, 500, 500, { sight: 50 });
    const p = addPlant(w, 520, 500, 30);
    const e0 = a.energy;
    for (let i = 0; i < 60; i++) step(w);
    expect(a.energy).toBeGreaterThan(e0);
    expect(p.food).toBeLessThan(30);
  });

  it("eat.plant: plants out of sight are not seen", () => {
    const w = empty();
    const a = addHerbivore(w, 500, 500, { sight: 20 });
    addPlant(w, 560, 500, 30);
    step(w);
    expect(a.activity).toBe("wander");
  });

  it("eat.plant: a bite is bitePerSize × size, and an eaten-out plant dies", () => {
    const w = empty({ animals: { minPlantFood: 1 } });
    const a = addHerbivore(w, 500, 500, { size: 1 });
    const p = addPlant(w, 502, 500, w.options.animals.bitePerSize + 0.5);
    const e0 = a.energy;
    step(w);
    expect(p.food).toBeCloseTo(0.5);
    expect(p.dead).toBe(true);
    expect(w.plants).toHaveLength(0);
    expect(a.energy).toBeGreaterThan(e0 + w.options.animals.bitePerSize - 1);
  });
});

describe("breeding", () => {
  function pair(w: World) {
    const a = addHerbivore(w, 500, 500);
    const b = addHerbivore(w, 503, 500);
    for (const x of [a, b]) { x.age = x.genes.maturity; x.energy = maxEnergy(w, x); }
    a.genes.litter = 2;
    return [a, b] as const;
  }

  it("breed.babies: two ready animals that touch make a litter", () => {
    const w = empty();
    const [a, b] = pair(w);
    step(w);
    const babies = w.animals.filter((x) => x !== a && x !== b);
    expect(babies).toHaveLength(2);
    expect(a.cooldown).toBeGreaterThan(0);
    expect(b.cooldown).toBeGreaterThan(0);
    for (const baby of babies) {
      expect(baby.age).toBeLessThanOrEqual(1);
      expect(baby.generation).toBe(1);
    }
    expect(w.totals.born.herbivore).toBe(2);
  });

  it("breed.babies: babies share breedEfficiency of what the parents gave", () => {
    const w = empty({ mutation: { chance: 0 } });
    const [a, b] = pair(w);
    const ao = w.options.animals;
    const given = ao.breedCost * (maxEnergy(w, a) + maxEnergy(w, b));
    step(w);
    const babies = w.animals.filter((x) => x !== a && x !== b);
    // Each baby got its share, then paid one tick of upkeep.
    for (const baby of babies) expect(baby.energy).toBeGreaterThan((given * ao.breedEfficiency) / 2 - 1);
    for (const baby of babies) expect(baby.energy).toBeLessThanOrEqual((given * ao.breedEfficiency) / 2);
  });

  it("breed.ready: young, tired or hungry animals don't breed", () => {
    for (const spoil of [
      (x: Animal) => { x.age = 0; },
      (x: Animal) => { x.cooldown = 10; },
      (x: Animal, w: World) => { x.energy = maxEnergy(w, x) * 0.5; },
    ]) {
      const w = empty();
      const [a, b] = pair(w);
      spoil(a, w);
      step(w);
      expect(w.animals.filter((x) => x !== a && x !== b)).toHaveLength(0);
    }
  });

  it("breed.meet: ready animals in sight walk to each other", () => {
    const w = empty();
    const a = addHerbivore(w, 500, 500, { sight: 80 });
    const b = addHerbivore(w, 540, 500, { sight: 80 });
    for (const x of [a, b]) { x.age = x.genes.maturity; x.energy = maxEnergy(w, x); }
    for (let i = 0; i < 40 && w.animals.length === 2; i++) step(w);
    expect(w.animals.length).toBeGreaterThan(2);
  });

  it("world.limit: no babies once the world holds maxAnimals", () => {
    const w = empty({ maxAnimals: 2 });
    pair(w);
    step(w);
    expect(w.animals).toHaveLength(2);
  });
});

describe("meat", () => {
  it("meat.rot: meat loses meatRot a tick and is gone at zero", () => {
    const w = empty({ meatRot: 1 });
    w.meat.push({ id: w.nextId++, x: 10, y: 10, food: 1.5 });
    step(w);
    expect(w.meat[0]!.food).toBeCloseTo(0.5);
    step(w);
    expect(w.meat).toHaveLength(0);
  });
});
