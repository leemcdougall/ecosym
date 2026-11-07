# 0002 TypeScript: an engine with no screens, and a browser page

Date: 7 Nov 2026. Following Project Nova (its ADR 0002).

**Decision:** TypeScript on Node 22, npm workspaces, Vitest for tests, Vite
for the page. The engine (`packages/engine`) holds the world and every rule
and has no screen, file or network code. The page (`packages/web`) only
draws and passes controls to the engine.

**Why:** tests can run worlds with no window; Claude can run worlds
(`npm run sim`) to tune the settings; the same engine can later feed other
front ends (itch.io, a phone wrapper, graphs).
