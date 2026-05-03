# Big Apple Defense

NYC tower defense vs aliens. Pick a clan — Finance Bros, Mobsters, Housewives, Street Thugs, Hipsters, Punks, or Cabbies — and defend the city with their unique brand of chaos.

## Status

**v0.1 — M1: Foundation**

Live at https://big-apple-defense.vercel.app

Phaser 3 + TypeScript + Vite pipeline verified end-to-end.

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

Game Design Document lives in the agent thread at version 0.3 — source of truth for clan mechanics, tower stats, wave compositions, and visual style.

## License

TBD
