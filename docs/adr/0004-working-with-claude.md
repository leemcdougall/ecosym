# 0004 How we work with Claude

Date: 7 Nov 2026. Copied from Project Nova's ADR 0005, which has the sources.

**Decision:**
- The main session (Opus) is the lead: plans milestones, writes issues,
  reviews and merges. `developer` agents (Sonnet, each in its own git
  worktree) build independent issues; a `reviewer` agent (Opus, read-only)
  reviews each pull request. Defined in `.claude/agents/`.
- Coupled work stays in the main session. At most 3 agents at once. No
  agents to re-check one's own work.
- Every issue says what "done" means; `npm run check` is the pass/fail check.
- Force-push and `git add -A` are denied in `.claude/settings.json`; a Stop
  hook runs the type check.
- Lee is asked about how the world should play, ADR changes, releases and
  deleting work.
