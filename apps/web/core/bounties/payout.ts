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

export function formatDeadline(deadline: string | null): string | null {
  if (!deadline) return null;
  const ms = Date.parse(deadline);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function isBountyEnded(deadline: string | null, now: number = Date.now()): boolean {
  if (!deadline) return false;
  const ms = Date.parse(deadline);
  return Number.isFinite(ms) && ms < now;
}
