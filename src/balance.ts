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
 * The single placeholder tower used in M2. M3+ replaces this with clan-specific
 * tower configs (Quant, Trader, Hedge Fund, etc.) per GDD §4–5.
 */
export const PLACEHOLDER_TOWER_CONFIG: TowerConfig = {
  damage: 18,
  range: 160,
  fireRateMs: 725,
  bodyColor: 0x1a2a44,
  accentColor: 0xd4af37,
  cost: 75,
};

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
