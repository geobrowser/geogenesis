import { BOUNTY_EST_PAYOUT_RATIO } from '~/core/constants';

import { difficultyKeyForId } from './labels';

/**
 * Advisory payout range, mirroring curator-app: easy bounties pay the flat
 * budget; medium/hard pay between a minimum share of the budget and the full
 * budget, at the reviewing editor's discretion. Display-only — nothing derives
 * the actual payout from it.
 */
export function payoutRange(budget: number | null, difficultyId: string | null): { min: number; max: number } | null {
  if (budget == null || !Number.isFinite(budget)) return null;
  const key = difficultyKeyForId(difficultyId);
  if (key === 'easy' || key === null) return { min: budget, max: budget };
  return { min: Math.round(budget * BOUNTY_EST_PAYOUT_RATIO), max: budget };
}

export function formatPoints(points: number): string {
  return points.toLocaleString('en-US');
}

export function formatPayoutRange(range: { min: number; max: number } | null): string | null {
  if (!range) return null;
  return range.min === range.max ? formatPoints(range.min) : `${formatPoints(range.min)} – ${formatPoints(range.max)}`;
}
