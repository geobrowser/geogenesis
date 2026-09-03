import { Effect, Either, Schema } from 'effect';

import { Environment } from '~/core/environment';
import {
  type ApiProposalListItem,
  ApiProposalListResponseSchema,
  encodePathSegment,
  isValidUUID,
  restFetch,
  validateActionTypes,
} from '~/core/io/rest';

export type GovernanceProposalCategory = 'all' | 'knowledge' | 'membership' | 'settings';
export type GovernanceProposalStatusFilter = 'pending' | 'accepted' | 'rejected';

/** @deprecated Prefer GovernanceProposalCategory — kept for home import compatibility. */
export type GovernanceHomeReviewCategory = GovernanceProposalCategory;
/** @deprecated Prefer GovernanceProposalStatusFilter — kept for home import compatibility. */
export type GovernanceHomeStatusFilter = GovernanceProposalStatusFilter;

export const GOVERNANCE_CATEGORY_LABELS: Record<GovernanceProposalCategory, string> = {
  all: 'All proposals',
  knowledge: 'Knowledge',
  membership: 'Membership',
  settings: 'Settings',
};

export const GOVERNANCE_STATUS_LABELS: Record<GovernanceProposalStatusFilter, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
};

const PAGE_SIZE = 100;

const SETTINGS_ACTION_TYPES = [
  'UpdateVotingSettings',
  'SetTopic',
  'UnsetTopic',
  'TopicDeclared',
  'TopicRemoved',
  'SubspaceVerified',
  'SubspaceUnverified',
  'SubspaceRelated',
  'SubspaceUnrelated',
  'SubspaceTopicDeclared',
  'SubspaceTopicRemoved',
] as const;

export function actionTypesForGovernanceCategory(category: GovernanceProposalCategory): string[] | undefined {
  switch (category) {
    case 'knowledge':
      return validateActionTypes(['Publish']);
    case 'membership':
      return validateActionTypes(['AddMember', 'RemoveMember', 'AddEditor', 'RemoveEditor']);
    case 'settings':
      return validateActionTypes([...SETTINGS_ACTION_TYPES]);
    default:
      return undefined;
  }
}

export function matchesGovernanceCategory(
  actionType: string | undefined,
  category: GovernanceProposalCategory
): boolean {
  if (category === 'all') return true;
  const allowed = actionTypesForGovernanceCategory(category);
  if (!allowed?.length) return false;
  const norm = (s: string) => s.replace(/_/g, '').toUpperCase();
  const u = norm(actionType ?? 'UNKNOWN');
  return allowed.some(a => norm(a) === u);
}

export function statusQueryParam(status: GovernanceProposalStatusFilter): string {
  if (status === 'pending') return 'PROPOSED,EXECUTABLE';
  if (status === 'accepted') return 'ACCEPTED';
  return 'REJECTED';
}

export function parseGovernanceCategory(
  raw?: string,
  legacy?: 'membership' | 'content' | 'all' | 'proposals' | 'requests'
): GovernanceProposalCategory {
  if (legacy === 'content' || legacy === 'proposals') return 'knowledge';
  if (legacy === 'membership' || legacy === 'requests') return 'membership';
  const allowed: GovernanceProposalCategory[] = ['all', 'knowledge', 'membership', 'settings'];
  if (raw && (allowed as string[]).includes(raw)) return raw as GovernanceProposalCategory;
  return 'all';
}

export function parseGovernanceStatus(raw?: string): GovernanceProposalStatusFilter {
  const allowed: GovernanceProposalStatusFilter[] = ['pending', 'accepted', 'rejected'];
  if (raw && (allowed as string[]).includes(raw)) return raw as GovernanceProposalStatusFilter;
  return 'pending';
}

/** REST query used by governance home and space governance lists. */
export async function fetchProposalsForSpaceByGovernanceFilters({
  spaceId,
  memberSpaceId,
  proposalType,
  category = 'all',
  status = 'pending',
}: {
  spaceId: string;
  memberSpaceId: string;
  proposalType?: 'membership' | 'content';
  category?: GovernanceProposalCategory;
  status?: GovernanceProposalStatusFilter;
}): Promise<readonly ApiProposalListItem[]> {
  const config = Environment.getConfig();

  const params = new URLSearchParams();
  params.set('limit', String(PAGE_SIZE));
  params.set('status', statusQueryParam(status));
  params.set('orderBy', 'end_time');
  params.set('orderDirection', 'desc');

  const resolvedCategory: GovernanceProposalCategory =
    category !== 'all'
      ? category
      : proposalType === 'content'
        ? 'knowledge'
        : proposalType === 'membership'
          ? 'membership'
          : 'all';

  const types = actionTypesForGovernanceCategory(resolvedCategory);
  if (types?.length) {
    params.set('actionTypes', types.join(','));
  }

  if (isValidUUID(memberSpaceId)) {
    params.set('voterId', memberSpaceId);
  }

  const path = `/proposals/space/${encodePathSegment(spaceId)}/status?${params.toString()}`;

  const result = await Effect.runPromise(
    Effect.either(
      restFetch<unknown>({
        endpoint: config.api,
        path,
      })
    )
  );

  if (Either.isLeft(result)) {
    console.error(`Failed to fetch proposals for space ${spaceId}:`, result.left);
    return [];
  }

  const decoded = Schema.decodeUnknownEither(ApiProposalListResponseSchema)(result.right);

  if (Either.isLeft(decoded)) {
    console.error(`Failed to decode proposals for space ${spaceId}:`, decoded.left);
    return [];
  }

  return decoded.right.proposals;
}
