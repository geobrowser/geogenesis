import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as Effect from 'effect/Effect';

import type { EditToolFailure } from '~/core/chat/edit-types';
import { getEntity } from '~/core/io/queries';

import { isEntityId, normalizeEntityId } from '../read/shared';
import type { WriteContext } from './context';

export { isEntityId, normalizeEntityId };

// Case-insensitive to match `isEntityId` — the model sometimes emits
// uppercase hex even though we normalize to lowercase. A lowercase-only
// pattern in the JSON Schema would silently reject those before validation.
export const ENTITY_ID_PATTERN =
  '^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$';

export function invalid(message?: string): EditToolFailure {
  return { ok: false, error: 'invalid_input', message };
}

export function notSignedIn(): EditToolFailure {
  return { ok: false, error: 'not_signed_in' };
}

export function notAuthorized(spaceId: string): EditToolFailure {
  return { ok: false, error: 'not_authorized', spaceId };
}

export function notFound(kind: 'entity' | 'property' | 'space', id: string, message?: string): EditToolFailure {
  return {
    ok: false,
    error: 'not_found',
    message: message ?? `${kind} ${id} not found`,
    ...(kind === 'entity' ? { entityId: id } : {}),
    ...(kind === 'property' ? { propertyId: id } : {}),
    ...(kind === 'space' ? { spaceId: id } : {}),
  };
}

export function wrongType(message: string): EditToolFailure {
  return { ok: false, error: 'wrong_type', message };
}

export function alreadyExists(message?: string): EditToolFailure {
  return { ok: false, error: 'already_exists', message };
}

export function rateLimited(retryAfter: number): EditToolFailure {
  return { ok: false, error: 'rate_limited', retryAfter };
}

export function lookupFailed(): EditToolFailure {
  return { ok: false, error: 'lookup_failed' };
}

export function normalizeName(name: string): string {
  return name.trim().replace(/[.\s]+$/, '');
}

export function normalizeDescription(description: string): string {
  const trimmed = description.trim();
  if (trimmed.length === 0) return trimmed;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * Member-only gate. Returns null on success or notSignedIn() for guests. Use
 * for tools that don't actually mutate the graph (toggleEditMode) so they
 * don't burn an edit-rate-limit token.
 */
export function requireMember(context: WriteContext): EditToolFailure | null {
  if (context.kind !== 'member') return notSignedIn();
  return null;
}

/**
 * Common gate run at the top of every graph-mutating write tool's execute:
 * rejects non-members and checks the per-wallet edit rate limit. Returns null
 * when the caller should proceed, or an EditToolFailure the caller should
 * return as-is.
 */
export async function writePrecheck(context: WriteContext): Promise<EditToolFailure | null> {
  const memberCheck = requireMember(context);
  if (memberCheck) return memberCheck;
  const limit = await context.checkEditRateLimit();
  if (!limit.ok) return rateLimited(limit.retryAfter);
  return null;
}

/**
 * Verifies that a BLOCKS relation from `parentEntityId` → `blockId` exists in
 * the given space. Used by deleteBlock / updateBlock / moveBlock /
 * setDataBlockView to stop the model from passing a wrong parentEntityId (the
 * common failure mode is the space id on a space-home page, where
 * `currentEntityId` can be absent and the model defaults to `currentSpaceId`).
 * Without this gate the client dispatcher ran its BLOCKS-edge loop against an
 * empty relation set, silently leaving a half-deleted block in the graph.
 *
 * Two short-circuits skip the live-graph check, both of them legitimate:
 * 1. Same-request mints (`context.mintedBlockIds`) — the BLOCKS edge is only
 *    staged locally until publish.
 * 2. Cross-session staged blocks — the block doesn't resolve in the live
 *    graph at all because it was created in an earlier chat turn and isn't
 *    published yet. We can't tell those from the server, but the client
 *    dispatcher resolves merged local+remote state correctly, so passing the
 *    intent through is safe. The wrong-parent failure mode we're guarding
 *    against requires the block to BE in the graph (otherwise there's no
 *    "real parent" to be wrong about); when both block and parent resolve we
 *    enforce the edge check normally.
 *
 * Returns null on success or an EditToolFailure the caller should return as-is.
 */
export async function resolveBlocksEdge(
  context: WriteContext,
  parentEntityId: string,
  blockId: string,
  spaceId: string
): Promise<EditToolFailure | null> {
  if (context.kind === 'member' && context.mintedBlockIds.has(blockId)) return null;
  try {
    const [parent, block] = await Promise.all([
      Effect.runPromise(getEntity(parentEntityId, spaceId)),
      Effect.runPromise(getEntity(blockId, spaceId)),
    ]);
    // Block isn't published yet → trust the caller; the dispatcher handles
    // staged state. Only enforce wrong-parent when the block is real.
    if (!block) return null;
    if (!parent) return notFound('entity', parentEntityId);
    const edge = (parent.relations ?? []).find(
      r =>
        r.fromEntity.id === parentEntityId &&
        r.type.id === SystemIds.BLOCKS &&
        r.toEntity.id === blockId &&
        r.spaceId === spaceId &&
        !r.isDeleted
    );
    if (!edge) {
      return notFound('entity', blockId, `block ${blockId} is not a child of ${parentEntityId}`);
    }
    return null;
  } catch (err) {
    console.error('[chat/resolveBlocksEdge] lookup failed', err);
    return lookupFailed();
  }
}
