export function rankingVoteWeight(k: number): number {
  return 0.5 + 0.5 / Math.log(k + 1);
}

export function rankingVoteWeightFromIndex(index: number): number {
  return rankingVoteWeight(index + 1);
}
