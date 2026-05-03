import Phaser from 'phaser';
import { WaveStep } from './WaveData';

export type WaveState = 'prep' | 'spawning' | 'mopping_up' | 'awaiting_advance' | 'all_done';

/**
 * Drives wave timing. Pure logic, no rendering.
 *
 * State machine:
 *  - prep             — countdown before wave starts (3 sec)
 *  - spawning         — enemies streaming out per WaveStep schedule
 *  - mopping_up       — all spawns issued, waiting for field to clear
 *  - awaiting_advance — wave fully cleared; GameScene will award gold then call advance()
 *  - all_done         — final wave cleared
 *
 * GameScene calls update() each frame:
 *  - If a WaveStep is returned, spawn that enemy
 *  - When state == 'awaiting_advance', credit the wave reward and call advance()
 */
export class WaveManager {
  private static readonly PREP_MS = 3000;

  private waveIndex = 0;
  private state: WaveState = 'prep';
  private steps: ReadonlyArray<WaveStep> = [];
  private nextStepIndex = 0;
  private nextSpawnAt = 0;
  private prepEndsAt = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly waves: ReadonlyArray<ReadonlyArray<WaveStep>>
  ) {
    if (waves.length === 0) {
      throw new Error('WaveManager requires at least one wave');
    }
    this.beginWave(0);
  }

  /** Tick the manager. Returns the WaveStep to spawn this tick, or null. */
  update(currentTimeMs: number, enemiesOnField: number): WaveStep | null {
    switch (this.state) {
      case 'prep':
        if (currentTimeMs >= this.prepEndsAt) {
          this.state = 'spawning';
          if (this.steps.length > 0) {
            this.nextSpawnAt = currentTimeMs + this.steps[0].delayAfterMs;
          } else {
            this.state = 'mopping_up';
          }
        }
        return null;

      case 'spawning': {
        if (
          this.nextStepIndex < this.steps.length &&
          currentTimeMs >= this.nextSpawnAt
        ) {
          const step = this.steps[this.nextStepIndex];
          this.nextStepIndex++;
          if (this.nextStepIndex < this.steps.length) {
            this.nextSpawnAt = currentTimeMs + this.steps[this.nextStepIndex].delayAfterMs;
          } else {
            this.state = 'mopping_up';
          }
          return step;
        }
        return null;
      }

      case 'mopping_up':
        if (enemiesOnField === 0) {
          this.state = 'awaiting_advance';
        }
        return null;

      case 'awaiting_advance':
      case 'all_done':
        return null;
    }
  }

  /** Move from 'awaiting_advance' to the next wave (or 'all_done'). */
  advance(): void {
    if (this.state !== 'awaiting_advance') return;
    this.waveIndex++;
    if (this.waveIndex >= this.waves.length) {
      this.state = 'all_done';
    } else {
      this.beginWave(this.waveIndex);
    }
  }

  // --- Queries ----------------------------------------------------------

  getCurrentWaveNumber(): number {
    return this.waveIndex + 1;
  }
  getTotalWaves(): number {
    return this.waves.length;
  }
  getState(): WaveState {
    return this.state;
  }
  isAllDone(): boolean {
    return this.state === 'all_done';
  }
  isAwaitingAdvance(): boolean {
    return this.state === 'awaiting_advance';
  }
  getPrepRemainingMs(currentTimeMs: number): number {
    if (this.state !== 'prep') return 0;
    return Math.max(0, this.prepEndsAt - currentTimeMs);
  }
  getEnemiesRemainingThisWave(enemiesOnField: number): number {
    const unspawned = Math.max(0, this.steps.length - this.nextStepIndex);
    return unspawned + enemiesOnField;
  }

  private beginWave(index: number): void {
    this.steps = this.waves[index];
    this.nextStepIndex = 0;
    this.state = 'prep';
    this.prepEndsAt = this.scene.time.now + WaveManager.PREP_MS;
  }
}
