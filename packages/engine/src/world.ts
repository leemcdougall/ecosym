import { between, makeDice, roll, type Dice } from "./dice.js";
import { childGenes, clamp, startGenes } from "./genes.js";
import {
  ANIMAL_GENES, PLANT_GENES, makeOptions,
  type AnimalGene, type DeepPartial, type PlantGene, type WorldOptions,
} from "./options.js";
import { delta, distance, Grid, wrap } from "./space.js";

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

export type Activity = "wander" | "food" | "mate" | "hunt" | "flee";

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
  /** Body grown so far: the meat it leaves when it dies (animals.grow). */
  body: number;
  generation: number;
  activity: Activity;
  /** Speed moved in the latest tick (for upkeep and the screen). */
  moved: number;
  /** Whether it sprinted in the latest tick (animals.stamina). */
  sprinted: boolean;
  /** Id of the animal it is hunting (hunt.chase, hunt.cannibal), if any. */
  target?: number;
  /** Tick it last struck or was struck (fight.damage), for the screen. */
  foughtAt?: number;
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
  /** Animals alive right now (the dead leave the list at the end of the tick). */
  living: number;
  /** Running totals since the world began. */
  totals: { born: Record<Kind, number>; died: Record<Kind, number> };
}

export function createWorld(seed: number, over: DeepPartial<WorldOptions> = {}): World {
  const options = makeOptions(over);
  const w: World = {
    seed, options, dice: makeDice(seed), tick: 0, nextId: 1,
    plants: [], animals: [], meat: [], living: 0,
    totals: { born: { herbivore: 0, carnivore: 0 }, died: { herbivore: 0, carnivore: 0 } },
  };
  const d = w.dice;
  for (let i = 0; i < options.start.plants; i++) {
    const p = newPlant(w, between(d, 0, options.width), between(d, 0, options.height),
      startGenes(d, PLANT_GENES, options.plants.genes), 0);
    p.food = options.plants.maxFood * between(d, options.start.plantFood[0], options.start.plantFood[1]);
    p.age = Math.floor(between(d, 0, p.genes.lifespan * options.start.ageFraction));
  }
  for (const kind of ["herbivore", "carnivore"] as const) {
    const n = kind === "herbivore" ? options.start.herbivores : options.start.carnivores;
    for (let i = 0; i < n; i++) {
      const genes = startGenes(d, ANIMAL_GENES, geneRanges(options, kind));
      const a = newAnimal(w, kind, between(d, 0, options.width), between(d, 0, options.height), genes, 0);
      a.energy = maxEnergy(w, a) * between(d, options.start.energy[0], options.start.energy[1]);
      a.age = Math.floor(between(d, genes.maturity, Math.max(genes.maturity, genes.lifespan * options.start.ageFraction)));
      a.cooldown = Math.floor(between(d, 0, genes.cooldown));
      a.body = fullBody(w, a); // starting animals are grown
    }
  }
  return w;
}

export const geneRanges = (o: WorldOptions, kind: Kind) =>
  kind === "herbivore" ? o.herbivores.genes : o.carnivores.genes;

export const maxEnergy = (w: World, a: Animal) => w.options.animals.energyPerSize * a.genes.size;
export const maxHealth = (w: World, a: Animal) => w.options.animals.healthPerSize * a.genes.size;
/** animals.grow: the meat a grown body is worth. */
export const fullBody = (w: World, a: Animal) =>
  (a.kind === "herbivore" ? w.options.herbivores : w.options.carnivores).meatPerSize * a.genes.size;
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
    stamina: genes.stamina, cooldown: 0, fed: 0, body: 0, generation, activity: "wander",
    moved: 0, sprinted: false, dead: false,
  };
  a.health = maxHealth(w, a);
  w.animals.push(a);
  w.living++;
  return a;
}

// ---------------------------------------------------------------- the tick

/** world.tick: advance the world one tick. */
export function step(w: World): void {
  const o = w.options;
  stepPlants(w);

  const plantGrid = new Grid<Plant>(o.width, o.height);
  plantGrid.fill(w.plants);
  // Animals move as they act, so the grid is told how far they can go in a tick.
  let drift = 0;
  for (const a of w.animals) if (a.genes.speed > drift) drift = a.genes.speed;
  const animalGrid = new Grid<Animal>(o.width, o.height, undefined, drift);
  animalGrid.fill(w.animals);
  const meatGrid = new Grid<Meat>(o.width, o.height);
  meatGrid.fill(w.meat);
  // Who is hunting whom (fight.flee), kept up to date as hunters act.
  const hunted = new Map<number, Animal[]>();
  for (const a of w.animals) if (a.target !== undefined && !a.dead) huntedAdd(hunted, a);

  // Birth order (the order animals were made); babies are appended and
  // first act next tick.
  const count = w.animals.length;
  for (let i = 0; i < count; i++) {
    const a = w.animals[i]!;
    if (a.dead) continue;
    act(w, a, plantGrid, animalGrid, meatGrid, hunted);
    if (!a.dead) live(w, a);
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
    const rate = Math.max(p.genes.growth * po.minGrowth, p.genes.growth * (1 - po.thornGrowthCost * p.genes.thorns));
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

function huntedAdd(hunted: Map<number, Animal[]>, hunter: Animal): void {
  const list = hunted.get(hunter.target!);
  if (list) list.push(hunter); else hunted.set(hunter.target!, [hunter]);
}

/** hunt.sizeup / fight.damage: the blow a strikes b with. */
export function blow(w: World, a: Animal, b: Animal): number {
  return Math.max(w.options.fight.minDamage * a.genes.attack, a.genes.attack - b.genes.defence);
}

/** hunt.sizeup: a's chance of winning a fight with b. */
export function winChance(w: World, a: Animal, b: Animal): number {
  const mine = blow(w, a, b), theirs = blow(w, b, a);
  if (mine <= 0) return 0;
  if (theirs <= 0) return 1;
  const toWin = b.health / mine, toLose = a.health / theirs;
  return toLose / (toWin + toLose);
}

/** hunt.sizeup: would a take a fight with b? */
export function takesFight(w: World, a: Animal, b: Animal): boolean {
  const share = a.energy / maxEnergy(w, a);
  const bar = (1 - a.genes.boldness) * (1 - w.options.fight.hungerBoldness * (1 - share));
  return winChance(w, a, b) > bar;
}

/** Sense, decide and move (animals.sense, fight.flee, breed.*, eat.*, meat.eat, hunt.*, animals.wander). */
function act(w: World, a: Animal, plants: Grid<Plant>, animals: Grid<Animal>, meat: Grid<Meat>, hunted: Map<number, Animal[]>): void {
  const o = w.options, ao = o.animals;
  const sight = a.genes.sight;
  if (a.fed > 0) a.fed--; // animals.health: counts down the ticks since eating
  a.sprinted = false;
  if (a.target !== undefined) {
    const list = hunted.get(a.target);
    const i = list ? list.indexOf(a) : -1;
    if (i >= 0) list!.splice(i, 1);
    a.target = undefined;
  }
  const me = radius(w, a);

  // fight.flee: the nearest animal in sight hunting me
  let hunter: Animal | undefined, hunterD = Infinity;
  for (const b of hunted.get(a.id) ?? []) {
    const d = distance(a.x, a.y, b.x, b.y, o.width, o.height);
    if (!b.dead && d <= sight && d < hunterD) { hunter = b; hunterD = d; }
  }
  if (hunter && !takesFight(w, a, hunter)) {
    a.activity = "flee";
    a.heading = Math.atan2(-delta(a.y, hunter.y, o.height), -delta(a.x, hunter.x, o.width));
    const canSprint = a.stamina >= 1;
    go(w, a, canSprint ? a.genes.speed : a.genes.speed / 2, canSprint);
    return;
  }

  // breed.meet
  if (ready(w, a) && w.living < o.maxAnimals) {
    let mate: Animal | undefined, best = Infinity;
    animals.near(a.x, a.y, sight, (b, d) => {
      if (b !== a && b.kind === a.kind && d < best && ready(w, b)) { mate = b; best = d; }
    });
    if (mate) {
      a.activity = "mate";
      if (best <= me + radius(w, mate) + o.touch) { a.moved = 0; breed(w, a, mate); }
      else moveTo(w, a, mate.x, mate.y, best - me - radius(w, mate), false);
      return;
    }
  }

  // Starts eating below `hungry`; once eating, keeps on until full.
  const full = maxEnergy(w, a);
  const wants = a.energy < (a.activity === "food" ? full : ao.hungry * full);
  if (a.kind === "herbivore" && wants) {
    // eat.plant: the best value in sight: most food for the distance.
    let food: Plant | undefined, best = Infinity, value = -Infinity;
    plants.near(a.x, a.y, sight, (p, d) => {
      const v = p.food / (d + ao.plantDistanceWeight);
      if (!p.dead && p.food >= ao.minPlantFood && v > value) { food = p; best = d; value = v; }
    });
    if (food) {
      a.activity = "food";
      const touch = me + o.plants.radius + o.touch;
      if (best <= touch) { a.moved = 0; bitePlant(w, a, food); }
      else moveTo(w, a, food.x, food.y, best - touch, false);
      return;
    }
  }
  if (a.kind === "carnivore" && wants) {
    // meat.eat
    let food: Meat | undefined, best = Infinity, value = -Infinity;
    meat.near(a.x, a.y, sight, (m, d) => {
      const v = m.food / (d + ao.meatDistanceWeight);
      if (m.food >= ao.minMeatFood && v > value) { food = m; best = d; value = v; }
    });
    if (food) {
      a.activity = "food";
      const touch = me + o.touch;
      if (best <= touch) { a.moved = 0; biteMeat(w, a, food); }
      else moveTo(w, a, food.x, food.y, best - touch, false);
      return;
    }
    // hunt.chase, then hunt.cannibal
    let prey: Animal | undefined, preyD = Infinity, herbivoreSeen = false;
    animals.near(a.x, a.y, sight, (b, d) => {
      if (b.dead || b.kind !== "herbivore") return;
      herbivoreSeen = true;
      if (d < preyD && takesFight(w, a, b)) { prey = b; preyD = d; }
    });
    if (!prey && !herbivoreSeen && a.energy < o.fight.cannibalHungry * full) {
      animals.near(a.x, a.y, sight, (b, d) => {
        if (b !== a && !b.dead && b.kind === "carnivore" && d < preyD && takesFight(w, a, b)) { prey = b; preyD = d; }
      });
    }
    if (prey) {
      a.activity = "hunt";
      a.target = prey.id;
      huntedAdd(hunted, a);
      const touch = me + radius(w, prey) + o.touch;
      if (preyD <= touch) a.moved = 0;
      else moveTo(w, a, prey.x, prey.y, preyD - touch, true);
      // Reaching it this tick is enough to strike.
      if (preyD - a.moved <= touch) strike(w, a, prey);
      return;
    }
  }

  // animals.wander
  a.activity = "wander";
  a.heading += (roll(w.dice) - 0.5) * ao.turnJitter;
  go(w, a, a.genes.speed / 2);
}

/** fight.damage: a strikes b, b strikes back in the same moment. */
function strike(w: World, a: Animal, b: Animal): void {
  const toB = blow(w, a, b), toA = blow(w, b, a);
  b.health -= toB;
  a.health -= toA;
  a.foughtAt = b.foughtAt = w.tick;
  if (b.health <= 0) die(w, b, "killed");
  if (a.health <= 0) die(w, a, "killed");
}

/** meat.eat */
function biteMeat(w: World, a: Animal, m: Meat): void {
  const room = maxEnergy(w, a) - a.energy;
  const bite = Math.min(w.options.animals.bitePerSize * a.genes.size, m.food, room);
  m.food -= bite;
  a.energy += bite;
  a.fed = w.options.animals.fedTicks;
  if (bite >= room) a.activity = "wander";
}

function bitePlant(w: World, a: Animal, p: Plant): void {
  const room = maxEnergy(w, a) - a.energy;
  const bite = Math.min(w.options.animals.bitePerSize * a.genes.size, p.food, room);
  p.food -= bite;
  a.energy += bite;
  a.fed = w.options.animals.fedTicks;
  if (bite >= room) a.activity = "wander"; // full: done eating until hungry again
  if (p.food < 1) p.dead = true; // plants.die
  // plants.thorns
  const hurt = p.genes.thorns - a.genes.defence;
  if (hurt > 0) {
    a.health -= hurt;
    if (a.health <= 0) die(w, a, "killed");
  }
}

/** Head for a point `gap` away; sprint if asked and stamina allows (animals.stamina). */
function moveTo(w: World, a: Animal, x: number, y: number, gap: number, sprint: boolean): void {
  a.heading = Math.atan2(delta(a.y, y, w.options.height), delta(a.x, x, w.options.width));
  const canSprint = sprint && a.stamina >= 1;
  const top = canSprint ? a.genes.speed : a.genes.speed / 2;
  go(w, a, Math.min(top, Math.max(0, gap)), canSprint);
}

/**
 * Move along the heading. The animal grid's `drift` (see step) assumes nothing
 * moves an animal further than genes.speed in a tick; if a new rule does,
 * raise the allowance there.
 */
function go(w: World, a: Animal, speed: number, sprinting = false): void {
  a.x = wrap(a.x + Math.cos(a.heading) * speed, w.options.width);
  a.y = wrap(a.y + Math.sin(a.heading) * speed, w.options.height);
  a.moved = speed;
  if (sprinting) { a.stamina -= 1; a.sprinted = true; }
}

/** breed.babies */
function breed(w: World, a: Animal, b: Animal): void {
  const ao = w.options.animals;
  const give = ao.breedCost * maxEnergy(w, a) + ao.breedCost * maxEnergy(w, b);
  a.energy -= ao.breedCost * maxEnergy(w, a);
  b.energy -= ao.breedCost * maxEnergy(w, b);
  a.cooldown = a.genes.cooldown;
  b.cooldown = b.genes.cooldown;
  // world.limit: a litter cut short by the limit shares all the energy.
  const litter = Math.min(Math.max(1, Math.round(a.genes.litter)), w.options.maxAnimals - w.living);
  const each = (give * ao.breedEfficiency) / litter;
  const ranges = geneRanges(w.options, a.kind);
  const spread = ao.birthSpread;
  for (let i = 0; i < litter; i++) {
    const genes = childGenes(w.dice, ANIMAL_GENES, ranges, a.genes, b.genes, w.options.mutation);
    const baby = newAnimal(w, a.kind, (a.x + b.x) / 2 + (roll(w.dice) - 0.5) * spread,
      (a.y + b.y) / 2 + (roll(w.dice) - 0.5) * spread, genes, Math.max(a.generation, b.generation) + 1);
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
  // animals.grow: building the body costs energy, a share each tick until grown
  const full = fullBody(w, a);
  const cost = (a.kind === "herbivore" ? w.options.herbivores : w.options.carnivores).growCost;
  if (a.body < full && (a.energy > 0 || cost === 0)) {
    const grow = Math.min(full - a.body, full / g.maturity, cost > 0 ? a.energy / cost : Infinity);
    a.body += grow;
    a.energy -= grow * cost;
  }
  // animals.stamina: recovery when it didn't sprint this tick
  if (!a.sprinted) a.stamina = Math.min(g.stamina, a.stamina + ao.staminaRecovery);
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
  w.living--;
  w.totals.died[a.kind]++;
  w.meat.push({ id: w.nextId++, x: a.x, y: a.y, food: a.body });
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
