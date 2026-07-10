export class NoPlayersForRarityError extends Error {
  constructor(rarity: string) {
    super(`No players exist for rarity: ${rarity}`);
    this.name = 'NoPlayersForRarityError';
  }
}

export class InvalidRarityError extends Error {
  constructor(rarity: string) {
    super(`Invalid rarity: ${rarity}`);
    this.name = 'InvalidRarityError';
  }
}
