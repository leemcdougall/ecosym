# The rules

How the world works. This is the spec: every rule has a section name
(`page.slug` style, e.g. `genes.inherit`), and tests are named after it.
The numbers live in `packages/engine/src/options.ts` (every one is a
setting); this page names them.

Decided with Lee in the grilling of 7 Nov 2026. The original was Lee's
high-school tech demo; nothing of it survives, so this is rebuilt from
what Lee remembers, plus trade-offs the original didn't have.

## world

- **world.size** The world is `width` × `height` points. Nothing is a grid:
  positions are decimals.
- **world.wrap** The edges wrap: leaving the right edge brings you in on the
  left, and so on. Distances and directions always take the short way round.
- **world.tick** Time moves in ticks. Each tick, in order: plants grow and
  seed; each animal (in birth order) senses, decides, moves, eats or fights,
  pays its upkeep and ages; the dead turn to meat; meat rots.
- **world.start** A new world starts with `start.plants`, `start.herbivores`
  and `start.carnivores`, spread at random, with genes drawn from each
  kind's start range. Starting animals are adults of random age (up to
  `start.ageFraction` of lifespan) with `start.energy`; starting plants have
  `start.plantFood`.
- **world.limit** `maxAnimals` is a guard for the browser, not a rule of
  life: when the world holds that many living animals, no more are born. A
  litter cut short shares all the energy the parents gave.
- **world.touch** Two things touch when the gap between their edges is at
  most `touch` points, so rounding can't leave an animal a hair short.

## dice

- **dice.seed** Every world has a seed. The same seed and the same settings
  give the same world, tick for tick. All luck comes from one stream of dice
  made from the seed.

## genes

Every plant and animal carries genes: numbers that never change during its
life. Each gene has a `min` and `max` it can't go past.

- **genes.inherit** A baby takes each gene from one parent or the other,
  50/50, gene by gene (like DNA, not an average).
- **genes.mutate** Then each gene has `mutation.chance` of changing, by a
  random amount: a bell curve with spread `mutation.size` × (max − min).
  The result is kept inside min and max. Both settings can be changed while
  the world runs, to speed evolution up or slow it down.
- **genes.plant** A seed has only one parent, so it copies that parent's
  genes, then mutates.

Animal genes (both kinds have all of them):

| Gene | What it does | What it costs |
|---|---|---|
| speed | Top speed when sprinting (points per tick). Cruising is half | Upkeep, and moving costs more the faster you go |
| sight | How far it notices food, mates and danger | Upkeep |
| size | Bigger energy store, more health, bigger bites, more meat when dead | Upkeep and moving cost grow with size |
| lifespan | Ticks until it dies of old age | (none; age limits it) |
| maturity | Age at which it can breed | Waiting longer to breed |
| cooldown | Ticks between breedings | (none; shorter means more energy spent on babies) |
| litter | Babies per breeding (rounded) | The same energy is split between more babies |
| stamina | Ticks it can sprint before dropping to cruising speed | Upkeep |
| attack | Damage dealt in a fight | Upkeep |
| defence | Damage blocked in a fight, and thorns blocked when eating | Upkeep |
| boldness | How big a risk it takes in a fight (0 to 1) | Getting killed |

Plant genes:

| Gene | What it does | What it costs |
|---|---|---|
| seedRate | Chance each tick, when fully grown, of dropping a seed | Each seed costs `seedCost` food |
| spread | How far away its seeds land | (none; seeds landing far may land badly) |
| growth | Food grown per tick | (none) |
| lifespan | Ticks until it dies of old age | (none) |
| thorns | Hurts herbivores that bite it | Slows growth |

## plants

- **plants.grow** Each tick a plant grows `growth` × (1 − `thornGrowthCost`
  × thorns) food (at least `minGrowth` × `growth`), up to `maxFood`.
- **plants.seed** A fully grown plant drops a seed with chance `seedRate`
  each tick, if the world holds fewer than `cap` plants. The seed lands a
  random distance up to `spread` away, in a random direction, costs the
  parent `seedCost` food, and starts with `seedFood` food.
- **plants.sprout** Each tick there is also `sproutChance` of a new plant
  appearing at a random place with start-range genes (seeds blowing in).
- **plants.thorns** Each bite of a plant hurts the herbivore biting it by
  thorns − its defence health (nothing if defence is higher). Herbivores
  don't avoid thorny plants; they just get hurt.
- **plants.die** A plant dies when its food drops below 1 (eaten) or at the
  end of its lifespan.

## animals

- **animals.body** An animal's `maxEnergy` is `energyPerSize` × size and its
  `maxHealth` is `healthPerSize` × size. Its radius is `radiusBase` +
  `radiusPerSize` × size.
- **animals.upkeep** Each tick an animal pays energy:
  `upkeep.base` × size
  + `upkeep.speed` × speed × size
  + `upkeep.move` × size × (speed it moved this tick)²
  + `upkeep.sight` × sight + `upkeep.stamina` × stamina
  + `upkeep.attack` × attack + `upkeep.defence` × defence.
- **animals.grow** A grown body is worth its kind's `meatPerSize` × size. Babies are
  born with no body and build it: each tick, after upkeep, an animal not
  yet grown grows up to (grown body ÷ maturity), paying its kind's `growCost` × that
  in energy, until grown. With no energy to pay it doesn't grow. Starting
  animals are grown. Carnivores pay full price (`growCost` 1), so their
  meat is food that really went into them and carnivores eating carnivores
  never makes food from nothing. Herbivores grow free (`growCost` 0): their
  food is plants, which nothing feeds back to them.
- **animals.stamina** Sprinting uses one stamina a tick. With no stamina left
  it can only cruise. Not sprinting, it gets back `staminaRecovery` a tick,
  up to its stamina gene.
- **animals.health** With energy above zero, health recovers `regen` a tick,
  `regenFedFactor` times faster for `fedTicks` ticks counting the tick it ate. Each
  health point recovered costs `regenCost` energy.
- **animals.starve** With no energy left, it loses `starveDamage` health a
  tick.
- **animals.death** An animal dies when its health reaches zero or its age
  passes its lifespan. Every dead animal leaves meat: its body
  (`animals.grow`).
- **animals.sense** An animal knows about everything within its sight
  (measured from centre to centre, across the wrapped edges).
- **animals.wander** With nothing to do it cruises, turning a little at
  random each tick.

## eating

- **eat.plant** A herbivore that wants food (energy below `hungry` of max)
  cruises to the best plant it sees with at least `minPlantFood`: the most
  food for the distance (food ÷ (distance + `plantDistanceWeight`)). Once
  touching it takes a bite each tick: up to `bitePerSize` × size food,
  turned into energy one for one. Once eating, it keeps on until full.

## meat

- **meat.eat** A carnivore that wants food (the same `hungry` rule as
  herbivores) cruises to the best meat it sees with at least `minMeatFood`:
  the most food for the distance (food ÷ (distance + `meatDistanceWeight`)).
  Once touching it bites `bitePerSize` × size a tick, food into energy one
  for one, until full. Meat in sight comes before hunting.
- **meat.rot** Each tick every piece of meat loses `meatRot` food; at zero it
  is gone.

## breeding

- **breed.ready** An animal is ready to breed when it is an adult (age past
  maturity), its cooldown is over, and its energy is at least `breedEnergy`
  of max.
- **breed.meet** A ready animal cruises to the nearest ready animal of its
  own kind that it sees. When they touch, they breed.
- **breed.babies** Each parent gives `breedCost` of its own max energy.
  `breedEfficiency` of the total becomes the babies' energy, split equally
  between the litter (the first parent's litter gene, rounded, at least 1).
  Babies appear beside the parents (within `birthSpread`), age 0, and first
  act the next tick. Both parents start their cooldown. A baby's generation
  is one more than its higher-generation parent's.

## hunt

Carnivores hunt; herbivores and hunted carnivores decide whether to fight
or flee. All settings here are in `fight` unless named otherwise.

- **hunt.sizeup** Before a fight an animal sizes it up. Each side's blow is
  worked out by `fight.damage`. Ticks for me to win = their health ÷ my
  blow; ticks for them to win = my health ÷ their blow. My chance of winning
  is their ticks ÷ (my ticks + their ticks): 1 if they can't hurt me, 0 if I
  can't hurt them. I take the fight if that chance is above my bar:
  (1 − boldness) × (1 − `hungerBoldness` × (1 − energy ÷ max energy)).
  Bold animals take more risks, and hunger lowers the bar.
- **hunt.chase** A carnivore that wants food, with no meat in sight,
  sprints after the nearest herbivore it sees whose size-up it would take.
  That herbivore is its target. When they touch, it attacks
  (`fight.damage`); reaching touch during this tick's move is enough.
- **hunt.cannibal** A carnivore with energy below `cannibalHungry` of max,
  and no meat worth eating (at least `minMeatFood`) and no herbivore at all
  in sight, hunts the nearest other carnivore
  it sees whose size-up it would take, the same way.

## fight

- **fight.damage** When a hunter touches its target it strikes, and the
  target strikes back in the same moment. A blow does the striker's attack
  − the other's defence, but at least `minDamage` × attack (an animal with
  no attack does no harm). Health at zero means killed: it dies at once and
  leaves meat. The hunter stops where it is that tick; the target, if it
  hasn't acted yet this tick, still does (it may flee).
- **fight.flee** Each tick, before anything else, an animal looks for the
  nearest animal in sight that has it as a target. If there is one it sizes
  up that fight. If it would take it, it stands its ground and carries on
  as if nothing was there (eating, breeding, wandering); the hunter's strike
  still brings a blow back. If not, it sprints straight away from the
  hunter, and does nothing else that tick.
