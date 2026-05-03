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
 * v0.2.3 difficulty pass: more enemies per wave, faster spawn cadence, more
 * heavies in W3. Combined with tougher per-enemy stats this raises wave
 * pressure substantially.
 */
export const WAVE_DEFINITIONS: ReadonlyArray<ReadonlyArray<WaveStep>> = [
  // Wave 1 — intro: 10 grunts at 0.9s intervals
  buildWave([['grunt', 10, 900]]),

  // Wave 2 — volume: 16 grunts at 0.7s intervals (faster pace)
  buildWave([['grunt', 16, 700]]),

  // Wave 3 — mixed threat: grunts → heavies (4!) → grunts
  buildWave([
    ['grunt', 6, 650],
    ['heavy', 4, 1400],
    ['grunt', 6, 550],
  ]),
];

export const WAVE_REWARDS: ReadonlyArray<number> = [30, 40, 60];
