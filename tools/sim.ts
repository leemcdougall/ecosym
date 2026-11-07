// Run a world with no screen and print the counts: npm run sim -- [seed] [ticks]
import { animalStats, createWorld, plantStats, step } from "../packages/engine/src/index.js";

const seed = Number(process.argv[2] ?? 1);
const ticks = Number(process.argv[3] ?? 20000);
const w = createWorld(seed);
const t0 = Date.now();
for (let t = 0; t <= ticks; t++) {
  if (t % 1000 === 0) {
    const h = animalStats(w, "herbivore"), c = animalStats(w, "carnivore"), p = plantStats(w);
    const f = (n?: number) => (n === undefined ? "-" : n.toFixed(2));
    console.log(`t=${t} plants=${p.count} herb=${h.count} (speed ${f(h.average?.speed)} size ${f(h.average?.size)} sight ${f(h.average?.sight)} gen ${h.generation}) carn=${c.count} (speed ${f(c.average?.speed)}) meat=${w.meat.length}`);
  }
  step(w);
}
console.log(`${((Date.now() - t0) / ticks).toFixed(2)} ms/tick`);
