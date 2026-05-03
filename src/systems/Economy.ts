/**
 * Player resource state: gold and lives.
 * Owned by GameScene, mutated as enemies die / leak / towers get placed.
 */
export class Economy {
  public gold: number;
  public lives: number;
  public readonly maxLives: number;

  // Run-stats for the GameOver recap
  public goldEarned = 0;
  public goldSpent = 0;
  public kills = 0;

  constructor(startingGold: number, startingLives: number) {
    this.gold = startingGold;
    this.lives = startingLives;
    this.maxLives = startingLives;
    this.goldEarned = 0;
    this.goldSpent = 0;
    this.kills = 0;
  }

  canAfford(cost: number): boolean {
    return this.gold >= cost;
  }

  /** Spend gold. Returns true if successful, false if not enough gold. */
  spend(cost: number): boolean {
    if (!this.canAfford(cost)) return false;
    this.gold -= cost;
    this.goldSpent += cost;
    return true;
  }

  earn(amount: number): void {
    if (amount <= 0) return;
    this.gold += amount;
    this.goldEarned += amount;
  }

  /** Lose a life. Returns true if the player is now out of lives. */
  loseLife(): boolean {
    this.lives = Math.max(0, this.lives - 1);
    return this.lives === 0;
  }

  recordKill(): void {
    this.kills += 1;
  }
}
