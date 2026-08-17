/**
 * Typed client for curator-backend — the service that owns the parts of the
 * bounty program that are not on the knowledge graph: the points ledger,
 * submission review lifecycle, allocation validation and notification emails.
 *
 * Contract mirrors curator-app `packages/curator-utils/src/http/api.ts`.
 * Authenticated calls send the user's Privy identity token as a Bearer token;
 * curator-backend resolves it to the caller's personal space / person entity.
 * All ids in payloads are sent dashless-lowercase — mixed id formats are the
 * recurring bug class on that side.
 */
import { getCachedIdentityToken } from '~/core/auth/identity-token';
import { uuidToHex } from '~/core/id/normalize';

import { CURATOR_API_BASE_URL } from './config';

export class CuratorApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = 'CuratorApiError';
    this.status = status;
    this.code = code;
  }

  get isAuthError() {
    return this.status === 401 || this.status === 403;
  }
  get isRetryable() {
    return this.status >= 500 || this.status === 0;
  }
}

/** Thrown when the client is used on a build without a configured base URL — callers should have gated on it. */
export class CuratorApiUnavailableError extends Error {
  constructor() {
    super('curator-backend is not configured (NEXT_PUBLIC_CURATOR_API_BASE_URL)');
    this.name = 'CuratorApiUnavailableError';
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
  /** Override for tests / server contexts. Defaults to the cached Privy identity token. */
  getToken?: () => Promise<string | null>;
  baseUrl?: string | null;
};

async function curatorRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const baseUrl = options.baseUrl === undefined ? CURATOR_API_BASE_URL : options.baseUrl;
  if (!baseUrl) throw new CuratorApiUnavailableError();

  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.auth) {
    const token = await (options.getToken ?? getCachedIdentityToken)();
    if (!token) throw new CuratorApiError('Sign in to continue', 401, 'no_identity_token');
    headers.authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new CuratorApiError('Could not reach the curator service', 0, 'network');
  }

  if (!response.ok) {
    let message = `curator-backend ${response.status}`;
    let code: string | null = null;
    try {
      const payload = (await response.json()) as { message?: string; error?: string; _tag?: string };
      message = payload.message ?? payload.error ?? message;
      code = payload._tag ?? null;
    } catch {
      // non-JSON error body
    }
    throw new CuratorApiError(message, response.status, code);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const hex = (id: string) => uuidToHex(id);

// -- Space metrics / ledger -------------------------------------------------------

export type SpaceMetrics = {
  /** Points still available to fund bounties: ledger balance minus the budgets of open bounties. */
  balance: number;
  totalPaidOut: number;
};

export function getSpaceMetrics(spaceId: string, options?: Pick<RequestOptions, 'signal' | 'baseUrl'>) {
  return curatorRequest<SpaceMetrics>(`/space/${hex(spaceId)}`, options);
}

export type PayoutCreditInput = {
  spaceId: string;
  amount: number;
  bountyId: string;
  /** The KG payout relation id published in phase 1 — the backend's idempotency handle. */
  payoutEntityId: string;
  recipientEntityId: string;
};

export type PayoutCreditResponse = { success: boolean; newBalance: number; newTotalPaidOut: number };

export function createPayoutCredit(input: PayoutCreditInput, options?: Pick<RequestOptions, 'getToken' | 'baseUrl'>) {
  return curatorRequest<PayoutCreditResponse>(`/space/${hex(input.spaceId)}/payout`, {
    method: 'POST',
    auth: true,
    body: {
      amount: Math.round(input.amount),
      bountyId: hex(input.bountyId),
      payoutEntityId: hex(input.payoutEntityId),
      recipientEntityId: hex(input.recipientEntityId),
    },
    ...options,
  });
}

// -- Allocation ------------------------------------------------------------------

export type AllocationInput = { spaceId: string; bountyId: string; allocatedPersonId: string };

export function validateBountyAllocation(
  input: AllocationInput,
  options?: Pick<RequestOptions, 'getToken' | 'baseUrl'>
) {
  return curatorRequest<{ ok: boolean }>('/user/bounty-allocation/validate', {
    method: 'POST',
    auth: true,
    body: {
      spaceId: hex(input.spaceId),
      bountyId: hex(input.bountyId),
      allocatedPersonId: hex(input.allocatedPersonId),
    },
    ...options,
  });
}

export function notifyBountyAllocation(
  input: AllocationInput & { allocatedRelationId: string },
  options?: Pick<RequestOptions, 'getToken' | 'baseUrl'>
) {
  return curatorRequest<{ sent: boolean; reason: string | null }>('/user/notifications/bounty-allocation', {
    method: 'POST',
    auth: true,
    body: {
      spaceId: hex(input.spaceId),
      bountyId: hex(input.bountyId),
      allocatedPersonId: hex(input.allocatedPersonId),
      allocatedRelationId: hex(input.allocatedRelationId),
    },
    ...options,
  });
}

// -- Submission lifecycle -----------------------------------------------------------

export type SubmissionLifecycleStatus = 'in-progress' | 'ready-for-review' | 'paid' | 'rejected';

export type SubmissionLifecycleRecord = {
  submissionKey: string;
  creatorEntityId: string;
  firstProposalId: string;
  proposalIds: string[];
  status: SubmissionLifecycleStatus;
  lastActiveAt: string;
  requestedAt: string | null;
  reviewedAt: string | null;
  reviewedBySpaceId: string | null;
};

export function getSubmissionLifecycle(
  spaceId: string,
  bountyId: string,
  options?: Pick<RequestOptions, 'signal' | 'baseUrl'>
) {
  return curatorRequest<{ submissions: SubmissionLifecycleRecord[] }>(
    `/space/${hex(spaceId)}/bounty/${hex(bountyId)}/submission-lifecycle`,
    options
  );
}

export type SubmissionSegmentInput = {
  spaceId: string;
  bountyId: string;
  submissionKey: string;
  creatorEntityId: string;
  firstProposalId: string;
  proposalIds: string[];
  lastActiveAt: string;
};

function lifecycleMutation(action: 'request-review' | 'reject' | 'paid') {
  return (input: SubmissionSegmentInput, options?: Pick<RequestOptions, 'getToken' | 'baseUrl'>) =>
    curatorRequest<{ success: boolean; submission: SubmissionLifecycleRecord }>(
      `/space/${hex(input.spaceId)}/bounty/${hex(input.bountyId)}/submission-lifecycle/${action}`,
      {
        method: 'POST',
        auth: true,
        body: {
          submissionKey: input.submissionKey,
          creatorEntityId: hex(input.creatorEntityId),
          firstProposalId: hex(input.firstProposalId),
          proposalIds: input.proposalIds.map(hex),
          lastActiveAt: input.lastActiveAt,
        },
        ...options,
      }
    );
}

export const requestSubmissionReview = lifecycleMutation('request-review');
export const rejectSubmission = lifecycleMutation('reject');
export const markSubmissionPaid = lifecycleMutation('paid');

// -- Rewards ----------------------------------------------------------------------

export type BatchRewardsItem = { personId: string; rewards: number };

export function getBatchRewards(personIds: string[], options?: Pick<RequestOptions, 'getToken' | 'baseUrl'>) {
  return curatorRequest<{ items: BatchRewardsItem[] }>('/user/rewards/batch', {
    method: 'POST',
    auth: true,
    body: { personIds: personIds.slice(0, 100).map(hex) },
    ...options,
  });
}
