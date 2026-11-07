import { createWorld } from "@ecosym/engine";

const counts = document.querySelector<HTMLDivElement>("#counts")!;
const w = createWorld(1);
counts.textContent = `Coming soon (${w.plants.length} plants, ${w.animals.length} herbivores ready)`;
