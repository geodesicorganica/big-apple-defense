/**
 * Balance configuration — single source of truth for tunable game-feel numbers.
 *
 * All numbers that affect difficulty, economy, or pacing live here. Iterate on
 * this file alone to retune the game without touching system code.
 *
 * Verifying changes:
 *   1. Reload the game; the balance summary in browser devtools console
 *      shows the updated numbers (skill ceiling/floor, run HP, tower DPS).
 *   2. Press G in-game to see how the placement-grade distribution shifts
 *      with new tower range.
 *
 * Balance history (most-recent first):
 *   v0.3.3 — Hedge Fund tower added: 0 dmg, 240px aura, 300g, +50% damage
 *            multiplier on enemies in range (per GDD §4)
 *   v0.3.1 — Quant range 480→360, Trader range 320→160 (player feedback:
 *            "low-level tower shouldn't shoot across 3 tiles")
 *   v0.3.0 — M3 Finance Bros: replaced placeholder tower with Quant + Trader
 *            real tower configs per GDD §5
 *   v0.2.8 — refactor; consolidated all numbers here (no behavior change)
 *   v0.2.7 — placement scoring system added (no balance changes)
 *   v0.2.6 — grunt reward 5 → 6g; W1 bonus 25 → 50g
 *   v0.2.5 — kill rewards cut (grunt 8→5, heavy 25→18); range 185 → 160
 *   v0.2.4 — midpoint pass between v0.2.2 and v0.2.3
 *   v0.2.3 — tighter than v0.2.2; was too hard
 *   v0.2.2 — initial M2 numbers; was too easy
 */

import type { TowerConfig } from './entities/Tower';
import type { EnemyConfig } from './entities/Enemy';

// ---- Wave types ------------------------------------------------------

export type EnemyType = 'grunt' | 'heavy';

export interface WaveStep {
  readonly enemyType: EnemyType;
  readonly delayAfterMs: number;
}

/** Build a wave from compact group descriptors: [type, count, intervalMs]. */
function buildWave(groups: Array<readonly [EnemyType, number, number]>): WaveStep[] {
  const steps: WaveStep[] = [];
  for (const [enemyType, count, delayAfterMs] of groups) {
    for (let i = 0; i < count; i++) {
      steps.push({ enemyType, delayAfterMs });
    }
  }
  return steps;
}

// ---- Player resources -----------------------------------------------

export const STARTING_GOLD = 150;
export const STARTING_LIVES = 4;

// ---- Tower stats ----------------------------------------------------

/**
 * Identifier for a tower type. Used for selection UI and the TOWERS map.
 * Finance Bros loadout: Quant (sniper) + Trader (rapid-fire) + Hedge Fund
 * (passive damage-buff aura).
 */
export type TowerType = 'quant' | 'trader' | 'hedge_fund';

/**
 * Quant — Finance Bros sniper. High-DPS single target, long range. The
 * "always good" tower per GDD §4. Stats from GDD §5 with v0.3.1 nerf.
 *
 * v0.3.1: range cut 480 → 360 (6 → 4.5 tiles). 480 covered too much of the
 * map; one well-placed Quant could damage the entire run. 360 is still
 * meaningfully longer than Trader's 160 but forces multi-tower play.
 */
export const QUANT_TOWER: TowerConfig = {
  damage: 25,
  range: 360, // 4.5 tiles × 80px (was 6)
  fireRateMs: 1000,
  bodyColor: 0x1a2a44, // Wall Street navy
  accentColor: 0xd4af37, // gold
  cost: 150,
};

/**
 * Trader — Finance Bros rapid-fire DPS. Cheap filler. Stats from GDD §5
 * with v0.3.1 range nerf.
 *
 * v0.3.1: range cut 320 → 160 (4 → 2 tiles). Cheap towers shouldn't reach
 * across half the map; Trader is now genuinely short-range, requiring
 * placement directly adjacent to the path.
 */
export const TRADER_TOWER: TowerConfig = {
  damage: 8,
  range: 160, // 2 tiles × 80px (was 4)
  fireRateMs: 300,
  bodyColor: 0x1a2a44,
  accentColor: 0xc0c0c0, // silver
  cost: 75,
};

/**
 * Hedge Fund — Finance Bros premium support. No direct damage; passive aura
 * makes enemies in radius take +50% damage from any source. Per GDD §4–5.
 *
 * Strategic role: forces overlapping placement with damage towers. A Hedge
 * Fund placed alone is wasted; placed near a clustered Quant + Trader
 * pocket, it effectively boosts their DPS by 50% in that zone.
 */
export const HEDGE_FUND_TOWER: TowerConfig = {
  damage: 0,
  range: 240, // 3 tiles × 80px
  fireRateMs: 1000, // unused (aura tower) but kept for type consistency
  bodyColor: 0x1a2a44, // Wall Street navy
  accentColor: 0x10b981, // emerald
  cost: 300,
  aura: { damageMultiplier: 1.5 }, // +50% damage to enemies in range
};

/** Tower configs indexed by TowerType. */
export const TOWERS: Record<TowerType, TowerConfig> = {
  quant: QUANT_TOWER,
  trader: TRADER_TOWER,
  hedge_fund: HEDGE_FUND_TOWER,
};

/** Display names for tower types (used by the palette UI). */
export const TOWER_NAMES: Record<TowerType, string> = {
  quant: 'QUANT',
  trader: 'TRADER',
  hedge_fund: 'HEDGE FUND',
};

/**
 * The tower the placement scorer uses as its reference range. Quant has the
 * longest range so its scoring view is the most informative — it tells you
 * which tiles have the most path coverage potential.
 */
export const SCORING_REFERENCE_TOWER: TowerConfig = QUANT_TOWER;

// ---- Enemy stats ----------------------------------------------------

/** Standard grunt — basic enemy, alien green. */
export const GRUNT_CONFIG: EnemyConfig = {
  hp: 68,
  speed: 75,
  radius: 14,
  color: 0x7cf28a,
  goldReward: 6,
};

/** Heavy — tanky alien, acid purple. Introduced wave 3. */
export const HEAVY_CONFIG: EnemyConfig = {
  hp: 270,
  speed: 55,
  radius: 22,
  color: 0x8a2be2,
  goldReward: 18,
};

// ---- Wave configuration ---------------------------------------------

/**
 * 3 waves total — gentle intro, volume test, mixed-threat finale. Each
 * WaveStep entry is one enemy spawn with the delay (in ms) before that spawn,
 * relative to the previous spawn or wave start.
 *
 * Replaced in M3 by clan-aware wave configs once the GDD §7 wave plan lands.
 */
export const WAVE_DEFINITIONS: ReadonlyArray<ReadonlyArray<WaveStep>> = [
  // Wave 1 — intro: 9 grunts at 0.95s intervals
  buildWave([['grunt', 9, 950]]),

  // Wave 2 — volume: 14 grunts at 0.75s intervals
  buildWave([['grunt', 14, 750]]),

  // Wave 3 — mixed threat: grunts → 3 heavies → grunts
  buildWave([
    ['grunt', 6, 700],
    ['heavy', 3, 1450],
    ['grunt', 5, 600],
  ]),
];

/** Gold awarded for clearing each wave, indexed by wave number - 1. */
export const WAVE_REWARDS: ReadonlyArray<number> = [50, 35, 55];

/** Countdown time (ms) before each wave begins spawning. */
export const WAVE_PREP_MS = 3000;

// ---- Balance lens reference values ----------------------------------

/** Total enemy count for the full run, derived from WAVE_DEFINITIONS. */
export function getRunEnemyCount(): { grunts: number; heavies: number } {
  let grunts = 0;
  let heavies = 0;
  for (const wave of WAVE_DEFINITIONS) {
    for (const step of wave) {
      if (step.enemyType === 'heavy') heavies++;
      else grunts++;
    }
  }
  return { grunts, heavies };
}

/** Total HP across all enemies in the run. */
export function getRunTotalHp(): number {
  const { grunts, heavies } = getRunEnemyCount();
  return grunts * GRUNT_CONFIG.hp + heavies * HEAVY_CONFIG.hp;
}
