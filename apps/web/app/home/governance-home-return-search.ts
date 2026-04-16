import type {
  GovernanceHomeReviewCategory,
  GovernanceHomeStatusFilter,
} from './fetch-active-proposals-in-editor-spaces';

export type GovernanceHomeReturnState = {
  tab: 'review' | 'my';
  spaceId: string;
  category: GovernanceHomeReviewCategory;
  status: GovernanceHomeStatusFilter;
  proposalType?: 'membership' | 'content';
};

/** Query string (no leading `?`) to restore /home after closing a proposal opened from governance home. */
export function serializeGovernanceHomeReturnSearch(s: GovernanceHomeReturnState): string {
  const p = new URLSearchParams();
  if (s.tab === 'my') p.set('tab', 'my');
  if (s.spaceId !== 'all') p.set('space', s.spaceId);
  if (s.category !== 'all') p.set('proposalCategory', s.category);
  if (s.status !== 'pending') p.set('proposalStatus', s.status);
  if (s.proposalType) p.set('proposalType', s.proposalType);
  return p.toString();
}
