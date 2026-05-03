# Big Apple Defense

[![Live on Vercel](https://img.shields.io/github/deployments/geodesicorganica/big-apple-defense/Production?label=Live%20on%20Vercel&logo=vercel&logoColor=white)](https://big-apple-defense.vercel.app) [![Stack](https://img.shields.io/badge/stack-Phaser%203%20%2B%20TypeScript%20%2B%20Vite-blueviolet)](https://phaser.io) [![Status](https://img.shields.io/badge/status-M1%20Foundation-yellow)](https://github.com/geodesicorganica/big-apple-defense)

**🎮 Play it live → [big-apple-defense.vercel.app](https://big-apple-defense.vercel.app)**

NYC tower defense vs aliens. Pick a clan — Finance Bros, Mobsters, Housewives, Street Thugs, Hipsters, Punks, or Cabbies — and defend the city with their unique brand of chaos.

## Status

**v0.1 — M1: Foundation**

Phaser 3 + TypeScript + Vite pipeline verified end-to-end. GitHub repo connected to Vercel for auto-deploy on every push to `main`.

## Stack

- Phaser 3 — 2D game framework
- TypeScript — typed JavaScript
- Vite — dev server + build
- Vercel — deployment (auto-deploy on push to main)

## Development

```bash
npm install
npm run dev      # Vite dev server at http://localhost:5173
npm run build    # Build to /dist
npm run preview  # Preview the production build locally
```

## Build Sequence

- [x] **M1 — Foundation** — Coming Soon splash, deployed
- [ ] M2 — Core Loop (grid, path, placeholder tower + enemies)
- [ ] M3 — First Vertical Slice (Finance Bros only, 5 waves) ← validation gate
- [ ] M4 — Six More Clans
- [ ] M5 — Boss + Final Waves (Mothership, waves 6–10)
- [ ] M6 — Polish (animations, SFX, UI)
- [ ] M7 — Balance & Ship

## Design

Game Design Document lives in the agent thread at version 0.3 — source of truth for clan mechanics, tower stats, wave compositions, and visual style. Seven NYC archetype clans, each with mechanically distinct signature passives:

| Clan | Signature | Identity |
|------|-----------|----------|
| 🏦 Finance Bros | Bull Market — damage scales with gold on hand | Economy-first, late-game powerhouse |
| 🍝 Mobsters | Protection Racket — adjacent towers buff each other | Cluster-based dominance |
| 🥗 Housewives | PTA Coordination — slowed enemies take +50% from all sources | Defensive support |
| 🧢 Street Thugs | Grit — cheap, can place mid-wave | Adaptive swarm |
| 🎧 Hipsters | Aging — +10% damage per wave survived | Patience clan |
| 🎸 Punks | Last Stand — damage scales inversely with remaining lives | Comeback / panic mode |
| 🚕 Cabbies | Off the Meter — free relocations after waves 3, 6, 9 | Mobile defense |

## License

TBD

---

*Last verified deploy: 2026-05-03 — auto-deploy via Vercel GitHub App.*
