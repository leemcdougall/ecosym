import { between, makeDice, roll, type Dice } from "./dice.js";
import { childGenes, clamp, startGenes } from "./genes.js";
import {
  ANIMAL_GENES, PLANT_GENES, makeOptions,
  type AnimalGene, type DeepPartial, type PlantGene, type WorldOptions,
} from "./options.js";
import { delta, distance, Grid, wrap } from "./space.js";

/** Things count as touching within this many points of their edges. */
export const TOUCH = 1;

export type Kind = "herbivore" | "carnivore";

export interface Plant {
  id: number;
  x: number;
  y: number;
  genes: Record<PlantGene, number>;
  food: number;
  age: number;
  generation: number;
  dead: boolean;
}

export type Activity = "wander" | "food" | "mate";

export interface Animal {
  id: number;
  kind: Kind;
  x: number;
  y: number;
  heading: number;
  genes: Record<AnimalGene, number>;
  energy: number;
  health: number;
  age: number;
  stamina: number;
  cooldown: number;
  /** Ticks left of faster healing after eating (animals.health). */
  fed: number;
  generation: number;
  activity: Activity;
  /** Speed moved in the latest tick (for upkeep and the screen). */
  moved: number;
  dead: boolean;
  /** Why it died, once dead. */
  cause?: "old age" | "starved" | "killed";
}

export interface Meat { id: number; x: number; y: number; food: number }

export interface World {
  seed: number;
  options: WorldOptions;
  dice: Dice;
  tick: number;
  nextId: number;
  plants: Plant[];
  animals: Animal[];
  meat: Meat[];
  /** Running totals since the world began. */
  totals: { born: Record<Kind, number>; died: Record<Kind, number> };
}

export function createWorld(seed: number, over: DeepPartial<WorldOptions> = {}): World {
  const options = makeOptions(over);
  const w: World = {
    seed, options, dice: makeDice(seed), tick: 0, nextId: 1,
    plants: [], animals: [], meat: [],
    totals: { born: { herbivore: 0, carnivore: 0 }, died: { herbivore: 0, carnivore: 0 } },
  };
  const d = w.dice;
  for (let i = 0; i < options.start.plants; i++) {
    const p = newPlant(w, between(d, 0, options.width), between(d, 0, options.height),
      startGenes(d, PLANT_GENES, options.plants.genes), 0);
    p.food = between(d, options.plants.maxFood / 2, options.plants.maxFood);
    p.age = Math.floor(between(d, 0, p.genes.lifespan / 2));
  }
  for (const kind of ["herbivore", "carnivore"] as const) {
    const n = kind === "herbivore" ? options.start.herbivores : options.start.carnivores;
    for (let i = 0; i < n; i++) {
      const genes = startGenes(d, ANIMAL_GENES, geneRanges(options, kind));
      const a = newAnimal(w, kind, between(d, 0, options.width), between(d, 0, options.height), genes, 0);
      a.energy = maxEnergy(w, a) * between(d, 0.6, 0.9);
      a.age = Math.floor(between(d, genes.maturity, Math.max(genes.maturity, genes.lifespan / 2)));
      a.cooldown = Math.floor(between(d, 0, genes.cooldown));
    }
  }
  return w;
}

export const geneRanges = (o: WorldOptions, kind: Kind) =>
  kind === "herbivore" ? o.herbivores.genes : o.carnivores.genes;

export const maxEnergy = (w: World, a: Animal) => w.options.animals.energyPerSize * a.genes.size;
export const maxHealth = (w: World, a: Animal) => w.options.animals.healthPerSize * a.genes.size;
export const radius = (w: World, a: Animal) =>
  w.options.animals.radiusBase + w.options.animals.radiusPerSize * a.genes.size;

function newPlant(w: World, x: number, y: number, genes: Record<PlantGene, number>, generation: number): Plant {
  const p: Plant = {
    id: w.nextId++, x: wrap(x, w.options.width), y: wrap(y, w.options.height),
    genes, food: w.options.plants.seedFood, age: 0, generation, dead: false,
  };
  w.plants.push(p);
  return p;
}

function newAnimal(w: World, kind: Kind, x: number, y: number, genes: Record<AnimalGene, number>, generation: number): Animal {
  const a: Animal = {
    id: w.nextId++, kind, x: wrap(x, w.options.width), y: wrap(y, w.options.height),
    heading: roll(w.dice) * Math.PI * 2, genes, energy: 0, health: 0, age: 0,
    stamina: genes.stamina, cooldown: 0, fed: 0, generation, activity: "wander",
    moved: 0, dead: false,
  };
  a.health = maxHealth(w, a);
  w.animals.push(a);
  return a;
}

// ---------------------------------------------------------------- the tick

/** world.tick: advance the world one tick. */
export function step(w: World): void {
  const o = w.options;
  stepPlants(w);

  const plantGrid = new Grid<Plant>(o.width, o.height);
  plantGrid.fill(w.plants);
  const animalGrid = new Grid<Animal>(o.width, o.height);
  animalGrid.fill(w.animals);

  // Oldest first: the array is in birth order, babies are appended.
  const count = w.animals.length;
  for (let i = 0; i < count; i++) {
    const a = w.animals[i]!;
    if (a.dead) continue;
    act(w, a, plantGrid, animalGrid);
    live(w, a);
  }

  bury(w);
  rot(w);
  w.plants = w.plants.filter((p) => !p.dead);
  w.tick++;
}

function stepPlants(w: World): void {
  const o = w.options, po = o.plants;
  const n = w.plants.length;
  for (let i = 0; i < n; i++) {
    const p = w.plants[i]!;
    if (p.dead) continue;
    p.age++;
    if (p.age > p.genes.lifespan) { p.dead = true; continue; }
    // plants.grow
    const rate = Math.max(p.genes.growth / 10, p.genes.growth * (1 - po.thornGrowthCost * p.genes.thorns));
    p.food = Math.min(po.maxFood, p.food + rate);
    // plants.seed
    if (p.food >= po.maxFood && w.plants.length < po.cap && roll(w.dice) < p.genes.seedRate) {
      const ang = roll(w.dice) * Math.PI * 2;
      const dist = roll(w.dice) * p.genes.spread;
      const genes = childGenes(w.dice, PLANT_GENES, po.genes, p.genes, p.genes, o.mutation);
      newPlant(w, p.x + Math.cos(ang) * dist, p.y + Math.sin(ang) * dist, genes, p.generation + 1);
      p.food -= po.seedCost;
    }
  }
  // plants.sprout
  if (w.plants.length < po.cap && roll(w.dice) < po.sproutChance) {
    newPlant(w, roll(w.dice) * o.width, roll(w.dice) * o.height, startGenes(w.dice, PLANT_GENES, po.genes), 0);
  }
}

const ready = (w: World, a: Animal) =>
  !a.dead && a.age >= a.genes.maturity && a.cooldown <= 0 && a.energy >= w.options.animals.breedEnergy * maxEnergy(w, a);

/** Sense, decide and move (animals.sense, eat.*, breed.*, animals.wander). */
function act(w: World, a: Animal, plants: Grid<Plant>, animals: Grid<Animal>): void {
  const o = w.options, ao = o.animals;
  const sight = a.genes.sight;
  const me = radius(w, a);

  // breed.meet
  if (ready(w, a) && w.animals.length < o.maxAnimals) {
    let mate: Animal | undefined, best = Infinity;
    animals.near(a.x, a.y, sight, (b, d) => {
      if (b !== a && b.kind === a.kind && d < best && ready(w, b)) { mate = b; best = d; }
    });
    if (mate) {
      a.activity = "mate";
      if (best <= me + radius(w, mate) + TOUCH) breed(w, a, mate);
      else moveTo(w, a, mate.x, mate.y, best - me - radius(w, mate), false);
      return;
    }
  }

  // eat.plant
  if (a.kind === "herbivore" && a.energy < ao.hungry * maxEnergy(w, a)) {
    // The best value in sight: most food for the distance.
    let food: Plant | undefined, best = Infinity, value = -Infinity;
    plants.near(a.x, a.y, sight, (p, d) => {
      const v = p.food / (d + ao.plantDistanceWeight);
      if (!p.dead && p.food >= ao.minPlantFood && v > value) { food = p; best = d; value = v; }
    });
    if (food) {
      a.activity = "food";
      const touch = me + o.plants.radius + TOUCH;
      if (best <= touch) { a.moved = 0; bitePlant(w, a, food); }
      else moveTo(w, a, food.x, food.y, best - touch, false);
      return;
    }
  }

  // animals.wander
  a.activity = "wander";
  a.heading += (roll(w.dice) - 0.5) * ao.turnJitter;
  go(w, a, a.genes.speed / 2);
}

function bitePlant(w: World, a: Animal, p: Plant): void {
  const room = maxEnergy(w, a) - a.energy;
  const bite = Math.min(w.options.animals.bitePerSize * a.genes.size, p.food, room);
  p.food -= bite;
  a.energy += bite;
  a.fed = w.options.animals.fedTicks;
  if (p.food < 1) p.dead = true; // plants.die
}

/** Head for a point `gap` away; sprint if asked and stamina allows (animals.stamina). */
function moveTo(w: World, a: Animal, x: number, y: number, gap: number, sprint: boolean): void {
  a.heading = Math.atan2(delta(a.y, y, w.options.height), delta(a.x, x, w.options.width));
  const canSprint = sprint && a.stamina >= 1;
  const top = canSprint ? a.genes.speed : a.genes.speed / 2;
  go(w, a, Math.min(top, Math.max(0, gap)), canSprint);
}

function go(w: World, a: Animal, speed: number, sprinting = false): void {
  a.x = wrap(a.x + Math.cos(a.heading) * speed, w.options.width);
  a.y = wrap(a.y + Math.sin(a.heading) * speed, w.options.height);
  a.moved = speed;
  if (sprinting) a.stamina -= 1;
}

/** breed.babies */
function breed(w: World, a: Animal, b: Animal): void {
  const ao = w.options.animals;
  const give = ao.breedCost * maxEnergy(w, a) + ao.breedCost * maxEnergy(w, b);
  a.energy -= ao.breedCost * maxEnergy(w, a);
  b.energy -= ao.breedCost * maxEnergy(w, b);
  a.cooldown = a.genes.cooldown;
  b.cooldown = b.genes.cooldown;
  const litter = Math.max(1, Math.round(a.genes.litter));
  const each = (give * ao.breedEfficiency) / litter;
  const ranges = geneRanges(w.options, a.kind);
  for (let i = 0; i < litter && w.animals.length < w.options.maxAnimals; i++) {
    const genes = childGenes(w.dice, ANIMAL_GENES, ranges, a.genes, b.genes, w.options.mutation);
    const baby = newAnimal(w, a.kind, (a.x + b.x) / 2 + (roll(w.dice) - 0.5) * 6,
      (a.y + b.y) / 2 + (roll(w.dice) - 0.5) * 6, genes, Math.max(a.generation, b.generation) + 1);
    baby.energy = Math.min(maxEnergy(w, baby), each);
    w.totals.born[a.kind]++;
  }
}

/** Upkeep, stamina, health, ageing, death (animals.*). */
function live(w: World, a: Animal): void {
  const ao = w.options.animals, u = ao.upkeep, g = a.genes;
  // animals.upkeep
  a.energy -= u.base * g.size + u.speed * g.speed * g.size + u.move * g.size * a.moved * a.moved
    + u.sight * g.sight + u.stamina * g.stamina + u.attack * g.attack + u.defence * g.defence;
  // animals.stamina: recovery when it didn't sprint this tick
  if (a.moved <= g.speed / 2 + 1e-9) a.stamina = Math.min(g.stamina, a.stamina + ao.staminaRecovery);
  if (a.energy <= 0) {
    a.energy = 0;
    a.health -= ao.starveDamage; // animals.starve
  } else {
    // animals.health
    const want = maxHealth(w, a) - a.health;
    if (want > 0) {
      const heal = Math.min(want, ao.regen * (a.fed > 0 ? ao.regenFedFactor : 1), a.energy / ao.regenCost);
      a.health += heal;
      a.energy -= heal * ao.regenCost;
    }
  }
  if (a.fed > 0) a.fed--;
  if (a.cooldown > 0) a.cooldown--;
  a.age++;
  // animals.death
  if (a.health <= 0) die(w, a, a.energy <= 0 ? "starved" : "killed");
  else if (a.age > g.lifespan) die(w, a, "old age");
  a.energy = clamp(a.energy, 0, maxEnergy(w, a));
}

function die(w: World, a: Animal, cause: NonNullable<Animal["cause"]>): void {
  a.dead = true;
  a.cause = cause;
  w.totals.died[a.kind]++;
  w.meat.push({ id: w.nextId++, x: a.x, y: a.y, food: w.options.animals.meatPerSize * a.genes.size });
}

/** meat.rot */
function rot(w: World): void {
  for (const m of w.meat) m.food -= w.options.meatRot;
  w.meat = w.meat.filter((m) => m.food > 0);
}

function bury(w: World): void {
  w.animals = w.animals.filter((a) => !a.dead);
}

export { distance };
