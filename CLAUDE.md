# Ecosym: team rules

Read `README.md` first, then the files it points to as the task needs.
The research home is the Retro Hub (`~/Retro`); Ecosym has a row in its
Game projects table.

## Roles

| Role | Who | Job |
|---|---|---|
| Designer and owner | Lee | Decides how the world plays, watches it, approves milestones |
| Lead developer | Main Claude session (Opus) | Plans milestones, writes issues, reviews and merges, keeps docs right |
| Developers | `developer` agents (Sonnet, `.claude/agents/`) | One issue each, on its own branch and worktree |
| Reviewer | `reviewer` agent (Opus, read-only) | Reviews each pull request before merge |

Lee is new to git and wants short answers. Never ask Lee to run git. Use
they/them for Lee.

## How work flows

1. **Every piece of work is a GitHub issue** in a milestone, naming the
   `docs/rules.md` sections it builds and a "done when" list. Lee's ideas go
   in as issues labelled `idea`.
1a. **Grill marker on every issue**: `grill: full` (choices that depend on
   each other), `grill: quick` (1 or 2 questions for Lee) or `grill: none`
   (the rules page decides it). Before building, the lead runs the grilling
   skill at that depth without waiting to be asked.
2. **One issue, one branch, one pull request.** Branch `N-short-name`.
   Agents work in a worktree, never on `main`.
3. **Pull request:** what changed, `Closes #N`, the `npm run check` output.
4. **Review** by an agent that didn't write it (`reviewer` or `/code-review`),
   then squash-merge. Fixes after review get a short second review of just
   the fix. After merging, delete the branch and any worktree (check for
   uncommitted work first; if there is some, stop and tell Lee).
5. **Milestone done:** Lee watches it. Bump the version, add a `CHANGELOG.md`
   entry, tag the release (ask Lee first), update `docs/roadmap.md`.
6. **Decisions** that shape the code get an ADR in `docs/adr/`.

## Working with Claude (ADR 0004)

- Delegate only independent issues (not touching the same files). At most 3
  agents at once. Coupled work stays in the main session.
- Deliver what the issue asks, at that scope. Extras become new issues.
- Keep going without asking on code, tests, reviews and merges that pass CI.
  **Ask Lee** about how the world should play, changing an ADR, a release,
  or deleting work that isn't a leftover.
- Proof, not claims: a PR shows the `npm run check` output.
- Messages to Lee: outcome first, short, no git jargon.

## Code rules

- **The engine has no screen, file or network code.** Front ends call it.
- **Rules come from `docs/rules.md`.** A rule changed or added there first,
  then code. Tests are named after the section (`genes.inherit: ...`).
- **Every number is a setting** in `WorldOptions` (`options.ts`), never a
  bare number in a rule.
- **Same seed, same world** (ADR 0003): all luck from `world.dice`, never
  `Math.random()` in the engine.
- **Tune with the sim**: `npm run sim -- SEED TICKS`. A change to the
  settings should keep a default world alive for 30,000 ticks on a few seeds,
  or say why not.
- Stage files by name, never `git add -A`. Don't commit `dist/`.

## End of session

Merge or leave a clear status on each open PR, update the roadmap, commit
and push, and tell Lee in one line: "Saved to GitHub: …". Then run
`git worktree list` and `git branch -a` and clean up anything merged.
