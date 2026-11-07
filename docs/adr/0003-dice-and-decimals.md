# 0003 Seeded dice, decimal maths

Date: 7 Nov 2026.

**Decision:**
- All luck comes from one seeded stream of dice (sfc32), kept in the world.
  Same seed and same settings give the same world, tick for tick. The page
  shows the seed; `?seed=N` replays it.
- The maths uses ordinary decimals (JavaScript numbers), not Project Nova's
  integer maths.

**Why:** a replayable world makes bugs repeatable and good runs shareable.
Project Nova uses integers to match Stars! exactly; Ecosym has no original
to match, and positions and speeds are naturally decimal. JavaScript's
decimal maths gives the same results every run, so replays still hold
(on the same version of the code).

**So:** a code change that adds or moves a roll changes later worlds for
the same seed. That's fine: seeds are for replaying within a version.
