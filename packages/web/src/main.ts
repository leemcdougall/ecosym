import { createWorld, geneRanges, radius, step, type World } from "@ecosym/engine";

const canvas = document.querySelector<HTMLCanvasElement>("#world")!;
const ctx = canvas.getContext("2d")!;
const pauseBtn = document.querySelector<HTMLButtonElement>("#pause")!;
const speedsEl = document.querySelector<HTMLSpanElement>("#speeds")!;
const countsEl = document.querySelector<HTMLDivElement>("#counts")!;
const seedEl = document.querySelector<HTMLSpanElement>("#seed")!;

const COLOURS = { plant: "#4caf50", herbivore: "#5fb4ff", carnivore: "#ff6b5f", meat: "#a0703c" };
const SPEEDS = [1, 2, 4, 8, 16];
/** Ticks a second at 1×, whatever the screen's refresh rate. */
const TICKS_PER_SECOND = 60;
/** Most ticks run in one frame, so a slow computer slows down instead of freezing. */
const MAX_TICKS_PER_FRAME = 64;
/** Display only: how big a piece of meat is drawn. */
const MEAT_DOT = { base: 1.5, perFood: 1 / 40, most: 2 };

/** ?seed=N replays a world. Seeds are whole numbers from 0 to 4294967295. */
function readSeed(): number {
  const raw = new URLSearchParams(location.search).get("seed");
  const n = raw === null || raw.trim() === "" ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 0xffffffff ? n : Math.floor(Math.random() * 1e9);
}
const seed = readSeed();
const world: World = createWorld(seed);
let paused = false;
let speed = 1; // 1× to 16×
/** Smallest dot, in world points, so dots stay visible on small screens. */
let minRadius = 1;

seedEl.textContent = `seed ${seed}`;

for (const s of SPEEDS) {
  const b = document.createElement("button");
  b.textContent = `${s}×`;
  b.setAttribute("aria-pressed", String(s === speed));
  b.onclick = () => {
    b.blur(); // so Space doesn't click it again
    speed = s;
    for (const o of speedsEl.children) o.setAttribute("aria-pressed", String(o === b));
  };
  speedsEl.append(b);
}
const togglePause = () => {
  paused = !paused;
  pauseBtn.textContent = paused ? "Play" : "Pause";
};
pauseBtn.onclick = () => { pauseBtn.blur(); togglePause(); };
addEventListener("keydown", (e) => {
  if (e.code !== "Space") return;
  e.preventDefault();
  if (!e.repeat) togglePause();
});
addEventListener("keyup", (e) => { if (e.code === "Space") e.preventDefault(); });

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
// Refit whenever the space changes: window size, the header wrapping, or a
// move to a screen with a different pixel density.
new ResizeObserver(fit).observe(canvas.parentElement!);
matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener("change", fit);
fit();

/** Shade of a kind's colour by speed, across the speed gene's range: faster is brighter. */
function shade(hex: string, speed: number, min: number, max: number): string {
  const t = 0.55 + 0.75 * Math.max(0, Math.min(1, (speed - min) / (max - min || 1)));
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(Math.min(255, v * t));
  return `rgb(${ch(n >> 16)}, ${ch((n >> 8) & 255)}, ${ch(n & 255)})`;
}

/** A dot, drawn again on the far side when it overlaps an edge (the world wraps). */
function dot(x: number, y: number, r: number): void {
  const o = world.options;
  r = Math.max(r, minRadius);
  const xs = [x], ys = [y];
  if (x < r) xs.push(x + o.width); else if (x > o.width - r) xs.push(x - o.width);
  if (y < r) ys.push(y + o.height); else if (y > o.height - r) ys.push(y - o.height);
  ctx.beginPath();
  for (const px of xs) for (const py of ys) { ctx.moveTo(px + r, py); ctx.arc(px, py, r, 0, Math.PI * 2); }
  ctx.fill();
}

function draw(): void {
  const o = world.options;
  ctx.clearRect(0, 0, o.width, o.height);
  for (const p of world.plants) {
    ctx.globalAlpha = 0.45 + 0.55 * (p.food / o.plants.maxFood);
    ctx.fillStyle = COLOURS.plant;
    dot(p.x, p.y, o.plants.radius);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = COLOURS.meat;
  for (const m of world.meat) dot(m.x, m.y, MEAT_DOT.base + Math.min(MEAT_DOT.most, m.food * MEAT_DOT.perFood));
  for (const a of world.animals) {
    const r = geneRanges(o, a.kind).speed;
    ctx.fillStyle = shade(COLOURS[a.kind], a.genes.speed, r.start[0] * 0.5, r.start[1] * 1.5);
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

// Fixed time step: 1× is TICKS_PER_SECOND on any screen.
let frame = 0;
let last = performance.now();
let owed = 0;
function loop(now: number): void {
  const dt = Math.max(0, Math.min(0.25, (now - last) / 1000)); // a frame can be stamped before load
  last = now;
  if (!paused) {
    owed += dt * TICKS_PER_SECOND * speed;
    const run = Math.min(Math.floor(owed), MAX_TICKS_PER_FRAME);
    for (let i = 0; i < run; i++) step(world);
    owed = Math.min(owed - run, MAX_TICKS_PER_FRAME);
  }
  draw();
  if (frame++ % 10 === 0) counts();
  requestAnimationFrame(loop);
}
counts();
requestAnimationFrame(loop);
