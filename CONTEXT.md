# Words used in Ecosym

| Word | Means |
|---|---|
| world | Everything being simulated: its size, settings, dice, and every plant, animal and piece of meat |
| tick | One step of time. The world moves one tick at a time |
| kind | Plant, herbivore or carnivore. Not "species" (that word is kept for later, when kinds may split into species) |
| animal | A herbivore or a carnivore |
| herbivore | An animal that eats plants |
| carnivore | An animal that eats meat and hunts other animals |
| plant | Food for herbivores. Grows, seeds and spreads; never moves |
| meat | What a dead animal leaves. Carnivores eat it; it rots away |
| gene | One inherited number (speed, sight, thorns...). Fixed for a life |
| genes | All of one plant's or animal's genes |
| mutation | A random change to a gene when it is passed on. Its chance and size are settings |
| generation | How many births separate a plant or animal from the start of the world |
| energy | An animal's food store. Every action costs some; at zero it starves |
| health | Damage an animal can take. Recovers over time, faster after eating |
| upkeep | The energy an animal pays each tick for its body and genes |
| seed | (1) The number a world is made from: same seed, same settings, same world. (2) A new plant dropped by a plant. Context tells which |
| dice | The world's random rolls, all from the seed |
| setting | A number in the rules that can be changed (`WorldOptions`). Defaults in `packages/engine/src/options.ts` |
| rule | One section of `docs/rules.md`, named `page.slug` (e.g. `genes.inherit`) |
| engine | `packages/engine`: the world and its rules, no screens |
| front end | Anything that shows the world: the browser page, `tools/sim.ts` |
| extinct | A kind with none left. No new ones appear (no safety net) |
