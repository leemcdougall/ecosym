import { createWorld, radius, step, type World } from "@ecosym/engine";

const canvas = document.querySelector<HTMLCanvasElement>("#world")!;
const ctx = canvas.getContext("2d")!;
const pauseBtn = document.querySelector<HTMLButtonElement>("#pause")!;
const speedsEl = document.querySelector<HTMLSpanElement>("#speeds")!;
const countsEl = document.querySelector<HTMLDivElement>("#counts")!;
const seedEl = document.querySelector<HTMLSpanElement>("#seed")!;

const COLOURS = { plant: "#4caf50", herbivore: "#5fb4ff", carnivore: "#ff6b5f", meat: "#a0703c" };
const SPEEDS = [1, 2, 4, 8, 16];

const seed = Number(new URLSearchParams(location.search).get("seed")) || Math.floor(Math.random() * 1e9);
const world: World = createWorld(seed);
let paused = false;
let ticksPerFrame = 1;
/** Smallest dot, in world points, so dots stay visible on small screens. */
let minRadius = 1;

seedEl.textContent = `seed ${seed}`;

for (const s of SPEEDS) {
  const b = document.createElement("button");
  b.textContent = `${s}×`;
  b.setAttribute("aria-pressed", String(s === ticksPerFrame));
  b.onclick = () => {
    ticksPerFrame = s;
    for (const o of speedsEl.children) o.setAttribute("aria-pressed", String(o === b));
  };
  speedsEl.append(b);
}
const togglePause = () => {
  paused = !paused;
  pauseBtn.textContent = paused ? "Play" : "Pause";
};
pauseBtn.onclick = togglePause;
addEventListener("keydown", (e) => {
  if (e.code === "Space") { e.preventDefault(); togglePause(); }
});

/** Fit the canvas to the space it has, keeping the world's shape. */
function fit(): void {
  const box = canvas.parentElement!.getBoundingClientRect();
  const o = world.options;
  const scale = Math.min((box.width - 16) / o.width, (box.height - 16) / o.height);
  const dpr = devicePixelRatio || 1;
  canvas.style.width = `${o.width * scale}px`;
  canvas.style.height = `${o.height * scale}px`;
  canvas.width = Math.round(o.width * scale * dpr);
  canvas.height = Math.round(o.height * scale * dpr);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  minRadius = 1.5 / scale;
}
addEventListener("resize", fit);
fit();

/** Shade of a kind's colour by speed: faster is brighter. */
function shade(hex: string, speed: number): string {
  const t = Math.max(0.35, Math.min(1.3, speed / 2));
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(Math.min(255, v * t));
  return `rgb(${ch(n >> 16)}, ${ch((n >> 8) & 255)}, ${ch(n & 255)})`;
}

function dot(x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(r, minRadius), 0, Math.PI * 2);
  ctx.fill();
}

function draw(): void {
  const o = world.options;
  ctx.clearRect(0, 0, o.width, o.height);
  for (const p of world.plants) {
    ctx.globalAlpha = 0.3 + 0.7 * (p.food / o.plants.maxFood);
    ctx.fillStyle = COLOURS.plant;
    dot(p.x, p.y, o.plants.radius);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = COLOURS.meat;
  for (const m of world.meat) dot(m.x, m.y, 1.5 + Math.min(2, m.food / 40));
  for (const a of world.animals) {
    ctx.fillStyle = shade(COLOURS[a.kind], a.genes.speed);
    dot(a.x, a.y, radius(world, a));
  }
}

function counts(): void {
  const herb = world.animals.filter((a) => a.kind === "herbivore").length;
  const carn = world.animals.length - herb;
  const items: [string, string, number, boolean][] = [
    ["plants", COLOURS.plant, world.plants.length, true],
    ["herbivores", COLOURS.herbivore, herb, true],
    ["carnivores", COLOURS.carnivore, carn, world.options.start.carnivores > 0],
    ["meat", COLOURS.meat, world.meat.length, true],
  ];
  countsEl.innerHTML = items
    .filter(([, , , show]) => show)
    .map(([name, c, n]) => {
      const gone = n === 0 && name !== "meat" ? ` class="extinct" title="extinct"` : "";
      return `<span style="--dot:${c}"${gone}>${name} ${n}</span>`;
    })
    .join("") + `<span style="--dot:transparent">tick ${world.tick}</span>`;
}

let frame = 0;
function loop(): void {
  if (!paused) for (let i = 0; i < ticksPerFrame; i++) step(world);
  draw();
  if (frame++ % 10 === 0) counts();
  requestAnimationFrame(loop);
}
loop();
