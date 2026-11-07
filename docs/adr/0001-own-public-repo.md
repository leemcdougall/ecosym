# 0001 Its own repo, public, on GitHub Pages

Date: 7 Nov 2026. Decided by Lee in the grilling.

**Decision:** Ecosym lives in `leemcdougall/ecosym`, locally
`~/Projects/ecosym`, run like Project Nova (issues, milestones, pull
requests, review, CI, ADRs). The repo is **public** and the page is served
by GitHub Pages, built on every push to `main`.

**Why:** the Retro Hub rule (D21) is a private repo per game Lee builds, but
GitHub Pages needs a public repo on the free plan, and Lee chose the easiest
setup ("I'm fine with public. Whatever is easier to work with"). Nothing in
it is private: no saves, no game files, no decompiled code.

**Instead of:** private repo + Cloudflare Pages (needs a Cloudflare login and
token kept up to date).
