# Ecosym

Lee's evolution simulation: plants, herbivores and carnivores as dots on a
world whose edges wrap. Animals breed in pairs, babies inherit their parents'
genes with small random changes, and natural selection does the rest: slow
carnivores starve, fast herbivores survive.

A rebuild of a tech demo Lee made in high school (nothing of it survives;
rebuilt from memory, 2026). Plays in a browser: https://leemcdougall.github.io/ecosym/

## Start here

| File | What |
|---|---|
| `CLAUDE.md` | How the team works: roles, the task flow, rules for every session (agents in `.claude/agents/`) |
| `CONTEXT.md` | The words. Use them exactly in code and docs |
| `docs/rules.md` | How the world works: the spec. Every rule has a section name, tests use it |
| `docs/roadmap.md` | Milestones, what's done, what's next |
| `docs/adr/` | Decisions and why (index in `docs/adr/README.md`) |
| `CHANGELOG.md` | What changed in each version |
| GitHub Issues | The task board: every piece of work is an issue |

## Layout

| Folder | What |
|---|---|
| `packages/engine` | The simulation: world, rules, genes, dice. No screen code |
| `packages/web` | The browser page: draws the world, sends the controls to the engine |
| `tools/` | Helpers: `sim.ts` runs a world with no screen and prints the counts |

## Commands

```
npm install        once
npm run check      type check and all tests (must pass before any merge)
npm run dev        the page on this computer, reloading as code changes
npm run build      build the page into dist/ (GitHub Pages does this on every push to main)
npm run sim -- SEED TICKS   run a world with no screen, print counts every 1000 ticks
```

Add `?seed=N` to the page's address to replay a world.
