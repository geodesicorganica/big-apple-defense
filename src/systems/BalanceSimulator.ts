import {
  TOWERS,
  TowerType,
  GRUNT_CONFIG,
  HEAVY_CONFIG,
  WAVE_DEFINITIONS,
  getRunEnemyCount,
  getRunTotalHp,
} from '../balance';
import type { TowerConfig } from '../entities/Tower';
import type { PlacementScorer } from './PlacementScorer';

export interface PlacementOption {
  col: number;
  row: number;
  type: TowerType;
}

export interface SimulationResult {
  /** Total damage delivered across all towers + all enemies. */
  damageDelivered: number;
  /** Damage cap = total enemy HP across the run. */
  runHp: number;
  /** Predicted leaks if damageDelivered < runHp. */
  predictedLeaks: number;
  /** Verdict: WIN / LOSS / CLOSE. */
  verdict: 'WIN' | 'LOSS' | 'CLOSE';
  /** Per-tower damage breakdown for inspection. */
  perTower: Array<{
    placement: PlacementOption;
    pathInRange: number;
    damage: number;
  }>;
}

/**
 * Predicts whether a given set of tower placements will clear the run.
 *
 * Damage model — per tower, take the MIN of three bounds:
 *
 *   1. Fire-rate bound: a tower can never fire more than
 *      (totalRunDuration / fireRateSec) shots, each dealing tower.damage.
 *      This is the absolute max damage the tower can output regardless of
 *      placement.
 *
 *   2. Placement bound: enemies must walk through the tower's range to take
 *      damage. For each enemy type:
 *        time_in_range = pathInRange / enemy.speed
 *        per_enemy_dmg = min(enemy.hp, DPS × time_in_range)
 *      Total = N_grunts × per_grunt + N_heavies × per_heavy
 *
 *   3. Run HP bound: can't deal more damage than total enemy HP.
 *
 * Final per-tower damage = min(fireRateBound, placementBound, runHpBound).
 *
 * Caveats:
 *   - Doesn't model contention (multiple in-range enemies sharing one tower's
 *     fire). Tends to over-credit damage in dense waves.
 *   - Doesn't model overkill across towers (two towers shooting same low-HP
 *     enemy waste damage).
 *   - Doesn't model spawn timing per wave; treats run as one continuous fire
 *     window.
 *
 * Net effect: this is a soft upper bound on damage. If simulator says LOSS,
 * actual play is definitely a loss. If simulator says WIN by a wide margin,
 * actual play is probably a win. CLOSE results are most uncertain.
 */
export class BalanceSimulator {
  /** Pick top-N tiles by score, assigning the given tower type to each. */
  static topNPlacements(
    scorer: PlacementScorer,
    type: TowerType,
    n: number
  ): PlacementOption[] {
    return scorer
      .getRankedScores()
      .slice(0, n)
      .map((r) => ({ col: r.col, row: r.row, type }));
  }

  /** Pick bottom-N (worst placeable) tiles. */
  static bottomNPlacements(
    scorer: PlacementScorer,
    type: TowerType,
    n: number
  ): PlacementOption[] {
    const ranked = scorer.getRankedScores();
    const slice = ranked.slice(Math.max(0, ranked.length - n));
    return slice.map((r) => ({ col: r.col, row: r.row, type }));
  }

  /**
   * Approximate run duration in seconds, used for the fire-rate bound. Based
   * on average wave length (each wave ~25-35s including prep + spawn + travel).
   */
  private static readonly RUN_DURATION_SEC = 90;

  /**
   * Run the simulation against the full wave roster. The placement scorer is
   * used to look up pathInRange for each tower's specific range.
   */
  static simulate(
    placements: PlacementOption[],
    scorer: PlacementScorer
  ): SimulationResult {
    const { grunts: nGrunts, heavies: nHeavies } = getRunEnemyCount();
    const runHp = getRunTotalHp();

    let damageDelivered = 0;
    const perTower: SimulationResult['perTower'] = [];

    for (const placement of placements) {
      const cfg: TowerConfig = TOWERS[placement.type];
      // Score the tile against the tower's specific range.
      const pathInRange = scorer.scoreTileAtRange(placement.col, placement.row, cfg.range);
      const dps = cfg.damage / (cfg.fireRateMs / 1000);

      // Bound 1: fire-rate cap (max possible shots × damage per shot).
      const fireRateBound = BalanceSimulator.RUN_DURATION_SEC * dps;

      // Bound 2: placement cap (per-enemy time-in-range × DPS, summed).
      const dmgPerGrunt = Math.min(
        GRUNT_CONFIG.hp,
        (dps * pathInRange) / GRUNT_CONFIG.speed
      );
      const dmgPerHeavy = Math.min(
        HEAVY_CONFIG.hp,
        (dps * pathInRange) / HEAVY_CONFIG.speed
      );
      const placementBound = nGrunts * dmgPerGrunt + nHeavies * dmgPerHeavy;

      // Tower's contribution = MIN of bounds.
      const towerDamage = Math.min(fireRateBound, placementBound, runHp);

      damageDelivered += towerDamage;
      perTower.push({
        placement,
        pathInRange,
        damage: towerDamage,
      });
    }

    // Cap at run HP (overkill across towers doesn't help).
    const cappedDamage = Math.min(damageDelivered, runHp);
    const predictedLeaks = Math.max(0, runHp - cappedDamage);

    let verdict: 'WIN' | 'LOSS' | 'CLOSE';
    const ratio = cappedDamage / runHp;
    if (ratio >= 1.05) verdict = 'WIN';
    else if (ratio >= 0.85) verdict = 'CLOSE';
    else verdict = 'LOSS';

    return {
      damageDelivered: cappedDamage,
      runHp,
      predictedLeaks,
      verdict,
      perTower,
    };
  }

  /**
   * Print a comprehensive balance analysis to the browser console.
   *
   * Runs the simulator with three placement strategies:
   *   1. Optimal Quant + Trader mix (top tiles)
   *   2. All-Quant top-N (skill ceiling)
   *   3. All-Trader top-N (cheap-only baseline)
   *   4. Bottom-N placements (skill floor — should LOSS)
   *
   * The N count is based on what the player can realistically afford in a run.
   */
  static logFullAnalysis(scorer: PlacementScorer, startingGold: number): void {
    /* eslint-disable no-console */
    const runHp = getRunTotalHp();
    const { grunts, heavies } = getRunEnemyCount();

    // Reasonable tower-count target: starting gold / Trader cost
    // (cheapest tower) plus expected wave gold income (~280g) covers ~5-6 towers.
    const expectedTowers = Math.floor((startingGold + 280) / TOWERS.trader.cost);
    const optimalSize = Math.min(expectedTowers, 6);

    console.log('%c[Simulator] Predicted run outcomes', 'color:#fff200;font-weight:bold');
    console.log(
      `  Run total: ${grunts + heavies} enemies, ${runHp} HP (need ${runHp} damage to clear)`
    );
    console.log(`  Expected affordable tower count: ${expectedTowers}`);
    console.log('');

    // 1. Mixed optimal: best 2 spots for Quant, rest Trader (since Quant is premium)
    const quantTop = this.topNPlacements(scorer, 'quant', 2);
    const remainingScores = scorer
      .getRankedScores()
      .filter((r) => !quantTop.some((q) => q.col === r.col && q.row === r.row))
      .slice(0, optimalSize - 2);
    const traderRest: PlacementOption[] = remainingScores.map((r) => ({
      col: r.col,
      row: r.row,
      type: 'trader',
    }));
    const mixed = [...quantTop, ...traderRest];
    const mixedResult = this.simulate(mixed, scorer);
    console.log(
      `  MIXED (2 Quant + ${optimalSize - 2} Trader at top tiles): ${mixedResult.verdict} — ${Math.round(mixedResult.damageDelivered)}/${runHp} dmg (${Math.round((mixedResult.damageDelivered / runHp) * 100)}%)`
    );

    // 2. All-Quant top-N — skill ceiling
    const allQuantCount = Math.floor((startingGold + 280) / TOWERS.quant.cost);
    const allQuant = this.topNPlacements(scorer, 'quant', allQuantCount);
    const ceilingResult = this.simulate(allQuant, scorer);
    console.log(
      `  ALL QUANT (${allQuantCount} towers, top tiles) — skill ceiling: ${ceilingResult.verdict} — ${Math.round(ceilingResult.damageDelivered)}/${runHp} dmg (${Math.round((ceilingResult.damageDelivered / runHp) * 100)}%)`
    );

    // 3. All-Trader top-N — cheapest path
    const allTraderCount = Math.floor((startingGold + 280) / TOWERS.trader.cost);
    const allTrader = this.topNPlacements(scorer, 'trader', allTraderCount);
    const traderResult = this.simulate(allTrader, scorer);
    console.log(
      `  ALL TRADER (${allTraderCount} towers, top tiles): ${traderResult.verdict} — ${Math.round(traderResult.damageDelivered)}/${runHp} dmg (${Math.round((traderResult.damageDelivered / runHp) * 100)}%)`
    );

    // 4. Bottom-N — skill floor
    const floorTowers = this.bottomNPlacements(scorer, 'trader', optimalSize);
    const floorResult = this.simulate(floorTowers, scorer);
    console.log(
      `  WORST PLACEMENT (${optimalSize} Trader at bottom tiles) — skill floor: ${floorResult.verdict} — ${Math.round(floorResult.damageDelivered)}/${runHp} dmg (${Math.round((floorResult.damageDelivered / runHp) * 100)}%)`
    );

    // Diagnose
    console.log('');
    if (ceilingResult.verdict !== 'WIN') {
      console.warn(
        '  ⚠ Skill ceiling fails — even optimal placement loses. Buff towers or nerf enemies.'
      );
    }
    if (floorResult.verdict === 'WIN') {
      console.warn(
        '  ⚠ Skill floor succeeds — bad placement still wins. Game is too easy. Nerf towers or buff enemies.'
      );
    }
    if (
      ceilingResult.verdict === 'WIN' &&
      mixedResult.verdict !== 'LOSS' &&
      floorResult.verdict === 'LOSS'
    ) {
      console.log(
        '  ✓ Balance looks correct: optimal wins, mixed survives, worst loses.'
      );
    }
    /* eslint-enable no-console */
  }
}
