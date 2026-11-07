import { describe, expect, it, vi } from "vitest";
import { hypot2 } from "../src/space.js";
import {
  ANIMAL_GENES, childGenes, createWorld, defaultOptions, delta, distance, Grid, makeDice,
  fullBody, maxEnergy, maxHealth, radius, roll, step, takesFight, winChance, wrap, type Animal, type Plant, type World,
} from "../src/index.js";

/** An empty world: no plants, no animals, no sprouts. */
function empty(over: Parameters<typeof createWorld>[1] = {}): World {
  return createWorld(1, { start: { plants: 0, herbivores: 0, carnivores: 0 }, plants: { sproutChance: 0 }, ...over });
}

/** Put one herbivore with start-average genes into the world. */
function addHerbivore(w: World, x: number, y: number, genes: Partial<Animal["genes"]> = {}): Animal {
  return addAnimal(w, "herbivore", x, y, genes);
}

/** Put one carnivore with start-average genes into the world. */
function addCarnivore(w: World, x: number, y: number, genes: Partial<Animal["genes"]> = {}): Animal {
  return addAnimal(w, "carnivore", x, y, genes);
}

function addAnimal(w: World, kind: Animal["kind"], x: number, y: number, genes: Partial<Animal["genes"]>): Animal {
  const r = kind === "herbivore" ? w.options.herbivores.genes : w.options.carnivores.genes;
  const g = Object.fromEntries(ANIMAL_GENES.map((n) => [n, (r[n].start[0] + r[n].start[1]) / 2])) as Animal["genes"];
  const a: Animal = {
    id: w.nextId++, kind, x, y, heading: 0, genes: { ...g, ...genes },
    energy: 0, health: 0, age: 0, stamina: 0, cooldown: 0, fed: 0, body: 0, generation: 0,
    activity: "wander", moved: 0, sprinted: false, dead: false,
  };
  a.energy = maxEnergy(w, a) / 2;
  a.health = maxHealth(w, a);
  a.stamina = a.genes.stamina;
  a.body = fullBody(w, a); // grown, like a starting animal
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
    a.age = a.genes.maturity; // grown, so it leaves full meat
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
    expect(w.meat[0]!.food).toBeCloseTo(w.options.herbivores.meatPerSize - w.options.meatRot);
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
      expect(baby.body).toBe(0); // animals.grow
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

describe("food chain", () => {
  /** No healing, so health changes are only blows and thorns. */
  const still = () => empty({ animals: { regen: 0 } });
  /** A carnivore and a herbivore `gap` apart (edge to edge), the carnivore hungry. */
  function chase(w: World, gap: number, herb: Partial<Animal["genes"]> = {}, carn: Partial<Animal["genes"]> = {}) {
    const h = addHerbivore(w, 500, 500, { attack: 0, ...herb });
    h.energy = maxEnergy(w, h); // full, so it isn't busy looking for food
    const c = addCarnivore(w, 0, 500, { boldness: 0.5, ...carn });
    c.x = 500 - radius(w, h) - radius(w, c) - gap;
    c.energy = maxEnergy(w, c) * 0.3;
    return { h, c };
  }

  it("hunt.sizeup: my chance is their ticks to win over both sides' ticks", () => {
    const w = still();
    const a = addCarnivore(w, 100, 100, { attack: 5, defence: 0 });
    const b = addHerbivore(w, 300, 300, { attack: 2, defence: 1 });
    a.health = 60; b.health = 40;
    // I need 40 / (5 − 1) = 10 ticks, they need 60 / 2 = 30: 30 / 40
    expect(winChance(w, a, b)).toBeCloseTo(0.75);
    b.genes.attack = 0;
    expect(winChance(w, a, b)).toBe(1);
    a.genes.attack = 0;
    expect(winChance(w, a, b)).toBe(0);
  });

  it("hunt.sizeup: boldness lowers the bar, and so does hunger", () => {
    const w = still();
    const a = addCarnivore(w, 100, 100, { attack: 5, defence: 0, boldness: 0.4 });
    const b = addHerbivore(w, 300, 300, { attack: 2, defence: 1 });
    a.health = 60; b.health = 40; // a wins with chance 0.75
    a.energy = maxEnergy(w, a);
    a.genes.boldness = 0.2; // bar 0.8
    expect(takesFight(w, a, b)).toBe(false);
    a.genes.boldness = 0.4; // bar 0.6
    expect(takesFight(w, a, b)).toBe(true);
    a.genes.boldness = 0.2;
    a.energy = 0; // bar 0.8 × (1 − hungerBoldness)
    expect(takesFight(w, a, b)).toBe(true);
  });

  it("hunt.chase: a hungry carnivore sprints at a herbivore in sight and makes it its target", () => {
    const w = still();
    const { h, c } = chase(w, 40);
    step(w);
    expect(c.activity).toBe("hunt");
    expect(c.target).toBe(h.id);
    expect(c.moved).toBeCloseTo(c.genes.speed);
  });

  it("hunt.chase: a carnivore that isn't hungry leaves herbivores alone", () => {
    const w = still();
    const { c } = chase(w, 40);
    c.energy = maxEnergy(w, c);
    step(w);
    expect(c.activity).toBe("wander");
    expect(c.target).toBeUndefined();
  });

  it("hunt.chase: it won't chase a herbivore whose size-up it wouldn't take", () => {
    const w = still();
    const { c } = chase(w, 40, { attack: 15, defence: 15 }, { boldness: 0 });
    step(w);
    expect(c.activity).not.toBe("hunt");
  });

  it("meat.eat: meat in sight comes before hunting, and a bite is bitePerSize × size", () => {
    const w = still();
    const { c } = chase(w, 40);
    w.meat.push({ id: w.nextId++, x: c.x, y: c.y, food: 50 });
    const before = c.energy;
    step(w);
    expect(c.activity).toBe("food");
    expect(w.meat[0]!.food).toBeCloseTo(50 - w.options.animals.bitePerSize * c.genes.size - w.options.meatRot);
    expect(c.energy).toBeGreaterThan(before);
  });

  it("hunt.cannibal: a very hungry carnivore with no herbivore or meat in sight hunts a carnivore", () => {
    const w = still();
    const a = addCarnivore(w, 500, 500, { boldness: 0.5 });
    const b = addCarnivore(w, 540, 500, { attack: 0 });
    b.energy = maxEnergy(w, b); // not ready to breed: still cooling down
    b.cooldown = a.cooldown = 1000;
    a.energy = maxEnergy(w, a) * (w.options.fight.cannibalHungry - 0.1);
    step(w);
    expect(a.target).toBe(b.id);
  });

  it("hunt.cannibal: not above cannibalHungry, nor with a herbivore in sight", () => {
    const w = still();
    const a = addCarnivore(w, 500, 500, { boldness: 0.5 });
    const b = addCarnivore(w, 540, 500, { attack: 0 });
    b.cooldown = a.cooldown = 1000;
    a.energy = maxEnergy(w, a) * (w.options.fight.cannibalHungry + 0.1);
    step(w);
    expect(a.target).toBeUndefined();
    // a herbivore it won't fight still stops it turning on its own kind
    a.energy = maxEnergy(w, a) * 0.1;
    a.activity = "wander";
    addHerbivore(w, a.x, 540, { attack: 15, defence: 15 });
    a.genes.boldness = 0;
    step(w);
    expect(a.target).toBeUndefined();
  });

  it("fight.damage: touching, each side loses the other's attack minus its defence", () => {
    const w = still();
    const { h, c } = chase(w, 0, { attack: 1, defence: 1 }, { attack: 4, defence: 0.5 });
    const hh = h.health, ch = c.health;
    step(w);
    expect(hh - h.health).toBeCloseTo(4 - 1);
    expect(ch - c.health).toBeCloseTo(1 - 0.5);
  });

  it("fight.damage: a blow is at least minDamage × attack, and no attack does no harm", () => {
    const w = still();
    const { h, c } = chase(w, 0, { attack: 0, defence: 10 }, { attack: 4, defence: 0 });
    const hh = h.health, ch = c.health;
    step(w);
    expect(hh - h.health).toBeCloseTo(w.options.fight.minDamage * 4);
    expect(c.health).toBe(ch);
  });

  it("fight.damage: reaching the prey during the move is enough to strike", () => {
    const w = still();
    const { h, c } = chase(w, 0.5);
    const hh = h.health;
    h.genes.speed = 0.01;
    step(w);
    expect(h.health).toBeLessThan(hh);
  });

  it("fight.damage: health at zero is killed at once, leaving meat", () => {
    const w = still();
    const { h, c } = chase(w, 0, {}, { attack: 10 });
    h.health = 1;
    h.age = h.genes.maturity;
    step(w);
    expect(h.dead).toBe(true);
    expect(h.cause).toBe("killed");
    expect(w.meat).toHaveLength(1);
    expect(w.meat[0]!.food).toBeCloseTo(w.options.herbivores.meatPerSize * h.genes.size - w.options.meatRot);
    expect(c.dead).toBe(false);
  });

  it("fight.flee: a hunted animal that wouldn't take the fight sprints straight away", () => {
    const w = still();
    const { h, c } = chase(w, 20);
    step(w); // the carnivore picks its target; the herbivore acted first and didn't know yet
    const x = h.x;
    step(w);
    expect(h.activity).toBe("flee");
    expect(h.x - x).toBeCloseTo(h.genes.speed); // away from the carnivore on its left
    expect(c.target).toBe(h.id);
  });

  it("fight.flee: a hunted animal that would take the fight carries on", () => {
    const w = still();
    const { h, c } = chase(w, 20, { attack: 3, defence: 3, boldness: 1 });
    h.energy = maxEnergy(w, h) / 2;
    addPlant(w, 500, 500 + radius(w, h) + 2, 50);
    step(w);
    step(w);
    expect(c.target).toBe(h.id);
    expect(h.activity).toBe("food");
  });

  it("meat.eat: picks the most food for the distance, and ignores scraps below minMeatFood", () => {
    const w = empty({ animals: { regen: 0, minMeatFood: 20, meatDistanceWeight: 10 } });
    const c = addCarnivore(w, 500, 500);
    c.energy = maxEnergy(w, c) * 0.3;
    const scrap = { id: w.nextId++, x: 500, y: 500, food: 15 }; // 15 / 10: best, if it counted
    w.meat.push(scrap);
    w.meat.push({ id: w.nextId++, x: 500, y: 520, food: 40 }); // 40 / 30: best that counts
    w.meat.push({ id: w.nextId++, x: 450, y: 500, food: 60 }); // 60 / 60: biggest
    step(w);
    expect(c.activity).toBe("food");
    expect(scrap.food).toBeCloseTo(15 - w.options.meatRot); // not eaten
    expect(c.y).toBeGreaterThan(500); // heading for the 40, not the 60
    expect(c.x).toBeCloseTo(500);
  });

  it("hunt.sizeup: the bar is (1 − boldness) × (1 − hungerBoldness × (1 − energy share))", () => {
    const w = still();
    const a = addCarnivore(w, 100, 100, { attack: 5, defence: 0, boldness: 0.2 });
    const b = addHerbivore(w, 300, 300, { attack: 2, defence: 1 });
    a.health = 60; b.health = 40; // chance 0.75
    // bar = 0.8 × (1 − hb × (1 − share)) = 0.75 when share = 1 − (1 − 0.75 / 0.8) / hb
    const share = 1 - (1 - 0.75 / 0.8) / w.options.fight.hungerBoldness;
    a.energy = maxEnergy(w, a) * (share + 0.01);
    expect(takesFight(w, a, b)).toBe(false);
    a.energy = maxEnergy(w, a) * (share - 0.01);
    expect(takesFight(w, a, b)).toBe(true);
  });

  it("fight.damage: a hunter killed by the blow back dies at once and pays no upkeep", () => {
    const w = still();
    const { h, c } = chase(w, 0, { attack: 10 }, { attack: 5, boldness: 1 });
    c.health = 0.5;
    c.age = c.genes.maturity;
    const e = c.energy;
    step(w);
    expect(c.dead).toBe(true);
    expect(c.cause).toBe("killed");
    expect(c.energy).toBe(e);
    expect(h.dead).toBe(false);
  });

  it("fight.flee: a fleeing animal does nothing else, not even eat the plant it touches", () => {
    const w = still();
    const { h } = chase(w, 20);
    h.energy = maxEnergy(w, h) / 2;
    const p = addPlant(w, 500, 500, 50);
    step(w);
    const food = p.food;
    step(w);
    expect(h.activity).toBe("flee");
    expect(p.food).toBe(food);
  });

  it("plants.thorns: thorns can kill", () => {
    const w = still();
    const a = addHerbivore(w, 500, 500, { defence: 0 });
    addPlant(w, 500, 500, 50, { thorns: 10 });
    a.health = 5;
    step(w);
    expect(a.dead).toBe(true);
    expect(a.cause).toBe("killed");
  });

  it("plants.thorns: a bite hurts by thorns minus defence, nothing if defence is higher", () => {
    const w = still();
    const a = addHerbivore(w, 500, 500, { defence: 1 });
    addPlant(w, 500, 500, 50, { thorns: 4 });
    const h0 = a.health;
    step(w);
    expect(h0 - a.health).toBeCloseTo(3);
    a.genes.defence = 5;
    const h1 = a.health;
    step(w);
    expect(a.health).toBe(h1);
  });

  it("animals.grow: a young carnivore grows grown body ÷ maturity a tick, paying growCost × that", () => {
    const w = still();
    const a = addCarnivore(w, 500, 500, { size: 1, maturity: 100 });
    a.body = 0;
    a.energy = 40;
    const step1 = fullBody(w, a) / 100;
    const e = a.energy;
    step(w);
    expect(a.body).toBeCloseTo(step1);
    // grow is paid on top of upkeep (it wandered at cruising speed)
    const g = a.genes, u = w.options.animals.upkeep;
    const upkeep = u.base * g.size + u.speed * g.speed * g.size + u.move * g.size * a.moved * a.moved
      + u.sight * g.sight + u.stamina * g.stamina + u.attack * g.attack + u.defence * g.defence;
    expect(e - a.energy).toBeCloseTo(upkeep + step1 * w.options.carnivores.growCost);
  });

  it("animals.grow: no energy, no growing; grown animals stop growing", () => {
    const w = still();
    const a = addCarnivore(w, 500, 500);
    a.body = 0;
    a.energy = 0;
    a.health = 100;
    step(w);
    expect(a.body).toBe(0);
    const b = addCarnivore(w, 300, 300);
    const e = b.body;
    step(w);
    expect(b.body).toBe(e);
  });

  it("animals.grow: babies are born with no body, and the dead leave their body as meat", () => {
    const w = still();
    const a = addCarnivore(w, 500, 500);
    a.body = 7;
    a.energy = 0;
    a.health = 0.01;
    step(w);
    expect(a.dead).toBe(true);
    expect(w.meat[0]!.food).toBeCloseTo(7 - w.options.meatRot);
  });
  it("animals.grow: herbivores grow free by default", () => {
    const w = still();
    const a = addHerbivore(w, 500, 500, { maturity: 100 });
    a.body = 0;
    a.energy = 0;
    a.health = 100;
    step(w);
    expect(a.body).toBeCloseTo(fullBody(w, a) / 100);
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

  it("world.wrap: hypot2 gives the same bits as V8's Math.hypot, so existing seeds keep their worlds", () => {
    const dice = makeDice(11);
    for (let i = 0; i < 200000; i++) {
      const sc = 10 ** (roll(dice) * 6 - 3);
      const a = (roll(dice) - 0.5) * sc, b = (roll(dice) - 0.5) * sc * (i % 3 ? 1 : 0.01);
      expect(hypot2(a, b)).toBe(Math.hypot(a, b));
    }
    expect(hypot2(0, 0)).toBe(0);
    expect(hypot2(-3, 4)).toBe(5);
  });

  /** The order and distances a plain scan gives: cells row by row from the
   * search's top-left, each cell's items in fill order, no cell twice. */
  function scan<P extends { x: number; y: number }>(
    items: P[], w: number, h: number, cell: number, x: number, y: number, radius: number,
    home: { x: number; y: number }[] = items, // where each item was when the grid was filled
  ): [P, number][] {
    const cols = Math.max(1, Math.floor(w / cell)), rows = Math.max(1, Math.floor(h / cell));
    const idx = (p: { x: number; y: number }) => Math.min(rows - 1, Math.floor((p.y / h) * rows)) * cols + Math.min(cols - 1, Math.floor((p.x / w) * cols));
    const rc = Math.min(Math.ceil(radius / (w / cols)), Math.floor(cols / 2));
    const rr = Math.min(Math.ceil(radius / (h / rows)), Math.floor(rows / 2));
    const c0 = Math.floor((x / w) * cols), r0 = Math.floor((y / h) * rows);
    const seen = new Set<number>();
    const out: [P, number][] = [];
    for (let dr = -rr; dr <= rr; dr++) for (let dc = -rc; dc <= rc; dc++) {
      const c = (((r0 + dr) % rows) + rows) % rows * cols + (((c0 + dc) % cols) + cols) % cols;
      if (seen.has(c)) continue;
      seen.add(c);
      for (let i = 0; i < items.length; i++) {
        const it = items[i]!;
        if (idx(home[i]!) !== c) continue;
        const d = distance(x, y, it.x, it.y, w, h);
        if (d <= radius) out.push([it, d]);
      }
    }
    return out;
  }

  it("world.wrap: the grid finds what a plain scan finds, same order and distances, near every edge and across the whole world", () => {
    const dice = makeDice(5);
    type P = { x: number; y: number };
    // 25 by 15 cells (odd rows), 10 by 10 cells (even count: the repeat skip),
    // and 2 by 2 cells with a search reaching half the world.
    for (const [w, h, cell] of [[1600, 1000, 64], [1000, 1000, 100], [200, 200, 100]] as const) {
      const items: P[] = Array.from({ length: 400 }, () => ({ x: roll(dice) * w, y: roll(dice) * h }));
      const g = new Grid<P>(w, h, cell);
      g.fill(items);
      for (let k = 0; k < 200; k++) {
        const x = k % 3 === 0 ? roll(dice) * 20 : k % 3 === 1 ? w - roll(dice) * 20 : roll(dice) * w;
        const y = k % 2 ? roll(dice) * 20 : roll(dice) * h;
        const radius = k % 5 === 0 ? w / 2 : 5 + roll(dice) * 150; // every fifth reaches half the world
        const got: [P, number][] = [];
        g.near(x, y, radius, (it, d) => got.push([it, d]));
        const want = scan(items, w, h, cell, x, y, radius);
        expect(got.length).toBe(want.length);
        for (let i = 0; i < got.length; i++) {
          expect(got[i]![0]).toBe(want[i]![0]);
          expect(got[i]![1]).toBe(want[i]![1]);
        }
      }
    }
  });

  it("world.wrap: a grid told the drift finds what a plain scan of the filled cells finds after things walked; with no drift it loses some", () => {
    const dice = makeDice(9);
    type P = { x: number; y: number };
    const w = 1600, h = 1000, drift = 30;
    const items: P[] = Array.from({ length: 1500 }, () => ({ x: roll(dice) * w, y: roll(dice) * h }));
    const safe = new Grid<P>(w, h, 64, drift), unsafe = new Grid<P>(w, h, 64);
    safe.fill(items); unsafe.fill(items);
    const home = items.map((it) => ({ x: it.x, y: it.y }));
    for (const it of items) { // one tick of walking, up to `drift` each
      const a = roll(dice) * Math.PI * 2, s = roll(dice) * drift;
      it.x = wrap(it.x + Math.cos(a) * s, w); it.y = wrap(it.y + Math.sin(a) * s, h);
    }
    let lost = 0;
    for (let k = 0; k < 3000; k++) {
      const x = roll(dice) * w, y = roll(dice) * h, radius = 20 + roll(dice) * 50;
      const want = scan(items, w, h, 64, x, y, radius, home).length;
      let n = 0, m = 0;
      safe.near(x, y, radius, () => n++);
      unsafe.near(x, y, radius, () => m++);
      expect(n).toBe(want);
      if (m < want) lost++;
    }
    expect(lost).toBeGreaterThan(0); // the allowance is what keeps them
  });

  it("world.tick: a crowded, fast world comes out the same with the original look-around (every cell in the window, plain delta and Math.hypot)", () => {
    const crowded = () => {
      const w = createWorld(3, {
        start: { plants: 1200, herbivores: 1500, carnivores: 0 }, plants: { cap: 1200 },
        herbivores: { genes: { speed: { min: 0.2, max: 5, start: [4, 5] }, sight: { min: 5, max: 250, start: [30, 60] } } },
      } as never);
      for (let t = 0; t < 400; t++) step(w);
      return JSON.stringify(w);
    };
    const fast = crowded();
    // The reference: the first version of Grid.near, with no cell skipping.
    const spy = vi.spyOn(Grid.prototype, "near").mockImplementation(function (
      this: Grid<{ x: number; y: number }>, x: number, y: number, radius: number, fn: (it: { x: number; y: number }, d: number) => void,
    ) {
      const g = this as unknown as { w: number; h: number; cols: number; rows: number; cells: { x: number; y: number }[][] };
      const cw = g.w / g.cols, ch = g.h / g.rows;
      const rc = Math.min(Math.ceil(radius / cw), Math.floor(g.cols / 2));
      const rr = Math.min(Math.ceil(radius / ch), Math.floor(g.rows / 2));
      const c0 = Math.floor((x / g.w) * g.cols), r0 = Math.floor((y / g.h) * g.rows);
      const lastDr = 2 * rr === g.rows ? rr - 1 : rr, lastDc = 2 * rc === g.cols ? rc - 1 : rc;
      for (let dr = -rr; dr <= lastDr; dr++) {
        const r = ((r0 + dr) % g.rows + g.rows) % g.rows;
        for (let dc = -rc; dc <= lastDc; dc++) {
          const c = ((c0 + dc) % g.cols + g.cols) % g.cols;
          for (const it of g.cells[r * g.cols + c]!) {
            const d = Math.hypot(delta(x, it.x, g.w), delta(y, it.y, g.h));
            if (d <= radius) fn(it, d);
          }
        }
      }
    });
    let slow: string, looks = 0;
    try { slow = crowded(); looks = spy.mock.calls.length; } finally { spy.mockRestore(); }
    expect(looks).toBeGreaterThan(1000); // the swapped look really ran
    expect(slow).toBe(fast);
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
