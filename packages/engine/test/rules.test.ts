import { describe, expect, it } from "vitest";
import { hypot2 } from "../src/space.js";
import {
  ANIMAL_GENES, childGenes, createWorld, defaultOptions, delta, distance, Grid, makeDice,
  maxEnergy, maxHealth, radius, roll, step, wrap, type Animal, type Plant, type World,
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
    activity: "wander", moved: 0, sprinted: false, dead: false,
  };
  a.energy = maxEnergy(w, a) / 2;
  a.health = maxHealth(w, a);
  a.stamina = a.genes.stamina;
  w.animals.push(a);
  w.living++;
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

  it("world.wrap: the grid finds each thing once, in cell order, even when the search covers the whole world", () => {
    const dice = makeDice(7);
    type P = { x: number; y: number };
    // 4 by 3 cells (odd rows) and 4 by 4 cells (even rows, so the row skip runs too)
    for (const [w, h] of [[400, 300], [400, 400]] as const) {
      const items: P[] = Array.from({ length: 200 }, () => ({ x: roll(dice) * w, y: roll(dice) * h }));
      const g = new Grid<P>(w, h, 100);
      g.fill(items);
      for (const radius of [30, 150, 1000]) {
        const got: P[] = [];
        g.near(10, 10, radius, (it) => got.push(it));
        const want = items.filter((it) => distance(10, 10, it.x, it.y, w, h) <= radius);
        expect(new Set(got).size).toBe(got.length);
        expect(got).toHaveLength(want.length);
        // order: cell by cell, items in the order they were filled
        const cell = (it: P) => Math.floor(it.y / 100) * 4 + Math.floor(it.x / 100);
        const rank = (it: P) => items.indexOf(it);
        const rr = Math.min(Math.ceil(radius / 100), Math.floor(h / 100 / 2));
        const rc = Math.min(Math.ceil(radius / 100), 2);
        const expected: P[] = [];
        const seen = new Set<number>();
        for (let dr = -rr; dr <= rr; dr++) for (let dc = -rc; dc <= rc; dc++) {
          const rows = h / 100; // the search starts in row 0, column 0
          const c = ((dr % rows) + rows) % rows * 4 + ((dc % 4) + 4) % 4;
          if (seen.has(c)) continue;
          seen.add(c);
          expected.push(...items.filter((it) => cell(it) === c && want.includes(it)).sort((a, b) => rank(a) - rank(b)));
        }
        expect(got).toEqual(expected);
      }
    }
  });

  it("world.wrap: a tiny negative wraps to 0, never to the width", () => {
    expect(wrap(-1e-14, 1600)).toBeLessThan(1600);
  });

  it("world.touch: things touch within `touch` points of their edges", () => {
    const w = empty();
    const a = addHerbivore(w, 500, 500, { size: 1 });
    const gap = radius(w, a) + w.options.plants.radius + w.options.touch - 0.01;
    const p = addPlant(w, 500 + gap, 500, 30);
    step(w);
    expect(p.food).toBeLessThan(30); // bitten without moving
  });

  it("world.tick: animals act in birth order", () => {
    // Two ready herbivores both see a third; the first-made one breeds with it.
    const w = empty();
    const first = addHerbivore(w, 500, 500);
    const second = addHerbivore(w, 510, 500);
    const mid = addHerbivore(w, 505, 500, { size: 0.5 });
    for (const x of [first, second, mid]) { x.age = x.genes.maturity; x.energy = maxEnergy(w, x); }
    step(w);
    expect(first.cooldown).toBeGreaterThan(0);
    expect(mid.cooldown).toBeGreaterThan(0);
    expect(second.cooldown).toBe(0);
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

  it("genes.plant: a seed copies its one parent when nothing mutates", () => {
    const w = empty({ mutation: { chance: 0 } });
    const p = addPlant(w, 500, 500, w.options.plants.maxFood, { seedRate: 0.05, spread: 30, growth: 0.3, lifespan: 9000, thorns: 2 });
    for (let i = 0; i < 200 && w.plants.length < 2; i++) step(w);
    expect(w.plants[1]!.genes).toEqual(p.genes);
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

  it("animals.health: each health point recovered costs regenCost energy", () => {
    const w = empty({ animals: { upkeep: { base: 0, speed: 0, move: 0, sight: 0, stamina: 0, attack: 0, defence: 0 } } });
    const ao = w.options.animals;
    const a = addHerbivore(w, 500, 500);
    a.energy = maxEnergy(w, a);
    a.health = 1;
    step(w);
    expect(a.energy).toBeCloseTo(maxEnergy(w, a) - ao.regen * ao.regenCost, 9);
  });

  it("animals.health: fast healing lasts fedTicks ticks, counting the tick it ate", () => {
    const w = empty({ animals: { minPlantFood: 1 } });
    const a = addHerbivore(w, 500, 500);
    addPlant(w, 502, 500, 2); // one bite eats it all
    let fast = 0;
    for (let i = 0; i < w.options.animals.fedTicks + 5; i++) {
      a.health = 1;
      step(w);
      if (a.health > 1 + w.options.animals.regen * 1.5) fast++;
    }
    expect(fast).toBe(w.options.animals.fedTicks);
  });

  it("animals.body: energy, health and radius grow with size", () => {
    const w = empty();
    const ao = w.options.animals;
    const a = addHerbivore(w, 500, 500, { size: 2 });
    expect(maxEnergy(w, a)).toBe(ao.energyPerSize * 2);
    expect(maxHealth(w, a)).toBe(ao.healthPerSize * 2);
    expect(radius(w, a)).toBe(ao.radiusBase + ao.radiusPerSize * 2);
  });

  // Sprinting (stamina used, no recovery) is tested with the chases in M2.
  it("animals.stamina: walking recovers stamina up to the gene", () => {
    const w = empty();
    const a = addHerbivore(w, 500, 500, { stamina: 100 });
    a.energy = maxEnergy(w, a);
    a.stamina = 10;
    step(w);
    expect(a.stamina).toBe(10 + w.options.animals.staminaRecovery);
    a.stamina = 100;
    step(w);
    expect(a.stamina).toBe(100);
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

  it("eat.plant: picks the most food for the distance, not the nearest", () => {
    const w = empty();
    const a = addHerbivore(w, 500, 500, { sight: 80 });
    addPlant(w, 515, 500, 6); // near, nearly eaten: 6 / (15 + 10)
    const rich = addPlant(w, 440, 500, 60); // further, full: 60 / (60 + 10)
    step(w);
    expect(a.x).toBeLessThan(500);
    expect(rich.food).toBe(60);
  });

  it("eat.plant: once eating it keeps on until full, not just past hungry", () => {
    const w = empty();
    const a = addHerbivore(w, 500, 500);
    addPlant(w, 502, 500, 60, { growth: 0 });
    a.energy = maxEnergy(w, a) * w.options.animals.hungry - 0.5;
    let filled = -1;
    for (let i = 0; i < 20 && filled < 0; i++) {
      step(w);
      if (a.activity === "wander") filled = i;
    }
    expect(filled).toBeGreaterThan(0);
    expect(a.energy).toBeGreaterThan(maxEnergy(w, a) * 0.99);
    // Full, it stops eating and wanders off until hungry again.
    step(w);
    expect(a.activity).toBe("wander");
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

  it("breed.babies: a baby's generation is one more than its higher parent's", () => {
    const w = empty();
    const [a, b] = pair(w);
    a.generation = 3;
    b.generation = 5;
    step(w);
    for (const baby of w.animals.filter((x) => x !== a && x !== b)) expect(baby.generation).toBe(6);
  });

  it("breed.babies: litter is the first parent's gene, rounded, at least 1", () => {
    for (const [gene, want] of [[2.6, 3], [0.2, 1]] as const) {
      const w = empty();
      const [a, b] = pair(w);
      a.genes.litter = gene;
      b.genes.litter = 6;
      step(w);
      expect(w.animals.length - 2).toBe(want);
    }
  });

  it("breed.babies: breeding is not charged as movement", () => {
    const w = empty();
    const [a] = pair(w);
    a.moved = 3;
    step(w);
    expect(a.moved).toBe(0);
  });

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
    // Babies first act (and pay upkeep) the tick after they're born.
    for (const baby of babies) expect(baby.energy).toBeCloseTo((given * ao.breedEfficiency) / 2, 9);
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

  it("world.limit: a litter cut short by the limit shares all the energy", () => {
    const w = empty({ maxAnimals: 3, mutation: { chance: 0 } });
    const [a, b] = pair(w);
    a.genes.litter = 3;
    const ao = w.options.animals;
    const given = ao.breedCost * (maxEnergy(w, a) + maxEnergy(w, b));
    step(w);
    expect(w.animals).toHaveLength(3);
    const baby = w.animals[2]!;
    expect(baby.energy).toBeCloseTo(Math.min(maxEnergy(w, baby), given * ao.breedEfficiency), 9);
  });

  it("world.limit: animals that died this tick don't count", () => {
    const w = empty({ maxAnimals: 3 });
    const old = addHerbivore(w, 100, 100, { lifespan: 5 });
    old.age = 5; // dies of old age in its live() this tick, before the pair acts
    const [a, b] = pair(w);
    step(w);
    expect(old.dead).toBe(true);
    expect(w.animals.filter((x) => x !== a && x !== b)).toHaveLength(1);
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

  it("world.wrap: hypot2 gives the very same bits as Math.hypot", () => {
    const dice = makeDice(11);
    for (let i = 0; i < 200000; i++) {
      const sc = 10 ** (roll(dice) * 6 - 3);
      const a = (roll(dice) - 0.5) * sc, b = (roll(dice) - 0.5) * sc * (i % 3 ? 1 : 0.01);
      expect(hypot2(a, b)).toBe(Math.hypot(a, b));
    }
    expect(hypot2(0, 0)).toBe(0);
    expect(hypot2(-3, 4)).toBe(5);
  });

  it("world.wrap: the grid finds exactly what a full scan finds, in the same order, near every edge", () => {
    const dice = makeDice(5);
    type P = { x: number; y: number };
    const w = 1600, h = 1000;
    const items: P[] = Array.from({ length: 600 }, () => ({ x: roll(dice) * w, y: roll(dice) * h }));
    const g = new Grid<P>(w, h);
    g.fill(items);
    for (let k = 0; k < 300; k++) {
      const x = k % 3 === 0 ? roll(dice) * 20 : k % 3 === 1 ? w - roll(dice) * 20 : roll(dice) * w;
      const y = k % 2 ? roll(dice) * 20 : roll(dice) * h;
      const radius = 5 + roll(dice) * 150;
      const got = new Set<P>(), d: number[] = [];
      g.near(x, y, radius, (it, dist) => { got.add(it); d.push(dist); });
      const want = items.filter((it) => distance(x, y, it.x, it.y, w, h) <= radius);
      expect(got.size).toBe(want.length);
      for (const it of want) expect(got.has(it)).toBe(true);
    }
  });

  it("world.wrap: the grid still finds things that moved after fill, within its drift", () => {
    const g = new Grid<{ x: number; y: number }>(1000, 1000, 100, 5);
    const it = { x: 99, y: 500 }; // filled in the cell ending at x = 100
    g.fill([it]);
    it.x = 103; // moved 4 into the next cell
    const found: number[] = [];
    g.near(160, 500, 60, (_, d) => found.push(d));
    expect(found).toHaveLength(1);
  });
});
