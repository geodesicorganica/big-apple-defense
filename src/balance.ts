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
 * M3/C1 ships Quant + Trader; Hedge Fund arrives in C2.
 */
export type TowerType = 'quant' | 'trader';

/**
 * Quant — Finance Bros sniper. High-DPS single target, long range. The
 * "always good" tower per GDD §4. Stats from GDD §5.
 */
export const QUANT_TOWER: TowerConfig = {
  damage: 25,
  range: 480, // 6 tiles × 80px
  fireRateMs: 1000,
  bodyColor: 0x1a2a44, // Wall Street navy
  accentColor: 0xd4af37, // gold
  cost: 150,
};

/**
 * Trader — Finance Bros rapid-fire DPS. Cheap filler. Stats from GDD §5.
 */
export const TRADER_TOWER: TowerConfig = {
  damage: 8,
  range: 320, // 4 tiles × 80px
  fireRateMs: 300,
  bodyColor: 0x1a2a44,
  accentColor: 0xc0c0c0, // silver
  cost: 75,
};

/** Tower configs indexed by TowerType. */
export const TOWERS: Record<TowerType, TowerConfig> = {
  quant: QUANT_TOWER,
  trader: TRADER_TOWER,
};

/** Display names for tower types (used by the palette UI). */
export const TOWER_NAMES: Record<TowerType, string> = {
  quant: 'QUANT',
  trader: 'TRADER',
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
