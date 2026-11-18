import { Effect } from 'effect';

import { bearerToken, verifyPrivyIdentityToken } from '~/core/auth/server/privy-identity-token';
import { resolveMemberSpaceFromWalletSafe } from '~/core/browse/resolve-member-space-from-wallet';
import { getPublisherSpaceId } from '~/core/debates/server/acceptor-config';
import { getSpace, getSpaceRolesForParticipants } from '~/core/io/queries';
import { fetchActiveEditorRequest } from '~/core/io/subgraph/fetch-proposed-editors';
import { geo } from '~/core/sdk/geo-client';
import { normId } from '~/core/utils/norm-id';
import { validateSpaceId } from '~/core/utils/utils';

import type { GeoPublisherProposal, GeoPublisherStatus } from './types';

/**
 * The Geo publisher is the debate acceptor, which also writes calls to the graph (GEO-3593). Its
 * space id stays server-side: only a signed-in editor of the space gets an answer, and the answer
 * is a status or a ready-to-sign proposal, never the id on its own.
 */

export type PublisherGateFailure = { ok: false; status: 400 | 401 | 403 | 503; code: string };

type Gate = { ok: true; viewerSpaceId: string; publisherSpaceId: string; publisherIsEditor: boolean };

type Deps = {
  verify?: typeof verifyPrivyIdentityToken;
  resolveSpace?: typeof resolveMemberSpaceFromWalletSafe;
  publisherSpaceId?: () => string | null;
  roles?: (spaceId: string, ids: string[]) => Promise<{ editorSpaceIds: string[] }>;
  spaceType?: (spaceId: string) => Promise<string | null>;
  activeRequest?: typeof fetchActiveEditorRequest;
  appId?: string | undefined;
};

const defaultRoles = (spaceId: string, ids: string[]) => Effect.runPromise(getSpaceRolesForParticipants(spaceId, ids));
const defaultSpaceType = async (spaceId: string) => (await Effect.runPromise(getSpace(spaceId)))?.type ?? null;

/** The signed-in viewer must edit `spaceId`, a DAO space, and the publisher must be configured. */
async function gate(request: Request, rawSpaceId: string | null, deps: Deps): Promise<Gate | PublisherGateFailure> {
  if (!rawSpaceId || !validateSpaceId(normId(rawSpaceId))) return { ok: false, status: 400, code: 'invalid_space_id' };
  const spaceId = normId(rawSpaceId);

  const token = bearerToken(request.headers.get('authorization'));
  const appId = 'appId' in deps ? deps.appId : process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!token) return { ok: false, status: 401, code: 'sign_in_required' };
  if (!appId) return { ok: false, status: 503, code: 'auth_not_configured' };

  const publisherSpaceId = (deps.publisherSpaceId ?? getPublisherSpaceId)();
  if (!publisherSpaceId) return { ok: false, status: 503, code: 'publisher_not_configured' };

  const identity = await (deps.verify ?? verifyPrivyIdentityToken)(token, { appId });
  if (!identity?.walletAddress) return { ok: false, status: 401, code: 'invalid_identity_token' };
  const viewer = await (deps.resolveSpace ?? resolveMemberSpaceFromWalletSafe)(identity.walletAddress);
  if (!viewer) return { ok: false, status: 403, code: 'editor_required' };
  const viewerSpaceId = normId(viewer);

  const [roles, spaceType] = await Promise.all([
    (deps.roles ?? defaultRoles)(spaceId, [viewerSpaceId, publisherSpaceId]),
    (deps.spaceType ?? defaultSpaceType)(spaceId),
  ]);
  const editors = new Set(roles.editorSpaceIds.map(normId));
  if (!editors.has(viewerSpaceId)) return { ok: false, status: 403, code: 'editor_required' };
  if (spaceType !== 'DAO') return { ok: false, status: 400, code: 'space_not_dao' };

  return { ok: true, viewerSpaceId, publisherSpaceId, publisherIsEditor: editors.has(publisherSpaceId) };
}

/** The open add-editor request's state; a dead one (rejected, or past its window) is none. */
async function openRequest(spaceId: string, publisherSpaceId: string, deps: Deps) {
  const request = await (deps.activeRequest ?? fetchActiveEditorRequest)(spaceId, publisherSpaceId);
  if (!request) return null;
  if (!request.isVotingEnded) return 'pending';
  return request.canExecute ? 'executable' : null;
}

export async function getGeoPublisherStatus(
  request: Request,
  rawSpaceId: string | null,
  deps: Deps = {}
): Promise<{ ok: true; status: GeoPublisherStatus } | PublisherGateFailure> {
  const access = await gate(request, rawSpaceId, deps);
  if (!access.ok) return access;
  if (access.publisherIsEditor) return { ok: true, status: 'editor' };
  const open = await openRequest(normId(rawSpaceId!), access.publisherSpaceId, deps);
  return { ok: true, status: open ?? 'not_editor' };
}

/**
 * The add-editor proposal for the viewer to sign. Editor changes are slow path only on the DAO
 * contract (`actionIsFastPathValid` holds only addMember, removeMember and ping, in
 * geo-contracts-foundry DAOSpace.sol), so the viewer votes YES right after proposing; that vote
 * executes it at once wherever it clears the universal support threshold (`_voteProposal`'s early
 * execution), and otherwise it waits for the space's editors.
 */
export async function buildGeoPublisherProposal(
  request: Request,
  rawSpaceId: string | null,
  deps: Deps = {}
): Promise<
  { ok: true; proposal: GeoPublisherProposal } | PublisherGateFailure | { ok: false; status: 409; code: string }
> {
  const access = await gate(request, rawSpaceId, deps);
  if (!access.ok) return access;
  const spaceId = normId(rawSpaceId!);
  if (access.publisherIsEditor) return { ok: false, status: 409, code: 'already_editor' };
  if (await openRequest(spaceId, access.publisherSpaceId, deps)) {
    return { ok: false, status: 409, code: 'request_pending' };
  }

  const { to, calldata, proposalId } = geo.daoSpaces.proposeAddEditor({
    authorSpaceId: access.viewerSpaceId,
    spaceId,
    newEditorSpaceId: access.publisherSpaceId,
  });
  return { ok: true, proposal: { to, calldata, proposalId, authorSpaceId: access.viewerSpaceId } };
}
