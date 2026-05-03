/**
 * M2 wave definitions.
 * 3 waves total — gentle intro, volume test, mixed-threat finale.
 *
 * Each wave is a list of WaveStep entries: an enemy type to spawn and the delay
 * (in ms) BEFORE that enemy spawns (relative to the previous spawn or wave
 * start).
 *
 * Replaced in M3 by clan-aware wave configs once the GDD §7 wave plan lands.
 */

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

/**
 * Balance history:
 *   v0.2.2: 8/12/(5+3+4) at slower cadence — too easy
 *   v0.2.3: 10/16/(6+4+6) at faster cadence — too hard
 *   v0.2.4: 9/14/(6+3+5) at moderate cadence — midpoint dial-back
 *
 * Heavies dropped from 4 → 3 in W3 to ease the damage check; total enemy
 * counts pulled back about halfway from the v0.2.3 spike.
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

/**
 * Wave clear bonuses.
 *   v0.2.2: 50 / 70 / 100 — too easy
 *   v0.2.3: 30 / 40 / 60  — too hard
 *   v0.2.4: 40 / 55 / 80  — gold pooled
 *   v0.2.5: 25 / 35 / 55  — too tight; couldn't afford a tower after W1
 *   v0.2.6: 50 / 35 / 55  — W1 bonus doubled so post-W1 gold = ~104g
 *           (1 tower buyable immediately during W2 prep); W2/W3 unchanged
 */
export const WAVE_REWARDS: ReadonlyArray<number> = [50, 35, 55];
