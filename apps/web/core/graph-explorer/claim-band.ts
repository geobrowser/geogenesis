export type ClaimBand = 'agreed' | 'contested' | 'rejected';

/** Below this many responses a claim shows its count but no percent or band, on the panel and the card. */
export const MIN_RESPONSES_FOR_BAND = 3;

/** Widely agreed ≥65%, contested 35–64%, widely rejected <35%; null with no responses. */
export function claimBand(agrees: number, disagrees: number): ClaimBand | null {
  const total = agrees + disagrees;
  if (total <= 0) return null;
  const percent = agreePercent(agrees, disagrees)!;
  return percent >= 65 ? 'agreed' : percent >= 35 ? 'contested' : 'rejected';
}

export function agreePercent(agrees: number, disagrees: number): number | null {
  const total = agrees + disagrees;
  return total > 0 ? Math.round((agrees / total) * 100) : null;
}

export const CLAIM_BAND_LABELS: Record<ClaimBand, string> = {
  agreed: 'Widely agreed',
  contested: 'Contested',
  rejected: 'Widely rejected',
};
