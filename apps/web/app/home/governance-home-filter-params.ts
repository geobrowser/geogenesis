import type {
  GovernanceHomeReviewCategory,
  GovernanceHomeStatusFilter,
} from './fetch-active-proposals-in-editor-spaces';

export type GovernanceTab = 'review' | 'my';

export type GovernanceFilters = {
  spaceId: string;
  category: GovernanceHomeReviewCategory;
  status: GovernanceHomeStatusFilter;
};

export function parseGovernanceTab(raw?: string | null): GovernanceTab {
  return raw === 'my' ? 'my' : 'review';
}

export function parseCategory(raw?: string | null, legacy?: string | null): GovernanceHomeReviewCategory {
  if (legacy === 'content') return 'knowledge';
  if (legacy === 'membership') return 'membership';
  const allowed: GovernanceHomeReviewCategory[] = ['all', 'knowledge', 'membership', 'settings'];
  if (raw && (allowed as string[]).includes(raw)) return raw as GovernanceHomeReviewCategory;
  return 'all';
}

export function parseStatus(raw?: string | null): GovernanceHomeStatusFilter {
  const allowed: GovernanceHomeStatusFilter[] = ['pending', 'accepted', 'rejected'];
  if (raw && (allowed as string[]).includes(raw)) return raw as GovernanceHomeStatusFilter;
  return 'pending';
}

export function parseSpace(raw?: string | null): string {
  return raw && raw !== 'all' ? raw : 'all';
}
