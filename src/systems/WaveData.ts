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

export const WAVE_DEFINITIONS: ReadonlyArray<ReadonlyArray<WaveStep>> = [
  // Wave 1 — intro: 8 grunts at 1.0s intervals
  buildWave([['grunt', 8, 1000]]),

  // Wave 2 — volume: 12 grunts at 0.8s intervals
  buildWave([['grunt', 12, 800]]),

  // Wave 3 — mixed threat: grunts → heavies → grunts
  buildWave([
    ['grunt', 5, 700],
    ['heavy', 3, 1500],
    ['grunt', 4, 600],
  ]),
];

export const WAVE_REWARDS: ReadonlyArray<number> = [50, 70, 100];
