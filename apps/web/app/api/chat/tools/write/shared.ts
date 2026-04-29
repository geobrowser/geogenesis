import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as Effect from 'effect/Effect';

import type { EditToolFailure } from '~/core/chat/edit-types';
import { getEntity } from '~/core/io/queries';

import { isEntityId, normalizeEntityId } from '../read/shared';
import type { WriteContext } from './context';

export { isEntityId, normalizeEntityId };

// Case-insensitive to match isEntityId — the model can emit uppercase hex,
// and a lowercase-only pattern would silently reject before runtime.
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

// Use for non-mutating tools (e.g. toggleEditMode) to skip burning an
// edit-rate-limit token.
export function requireMember(context: WriteContext): EditToolFailure | null {
  if (context.kind !== 'member') return notSignedIn();
  return null;
}

export async function writePrecheck(context: WriteContext): Promise<EditToolFailure | null> {
  const memberCheck = requireMember(context);
  if (memberCheck) return memberCheck;
  const limit = await context.checkEditRateLimit();
  if (!limit.ok) return rateLimited(limit.retryAfter);
  return null;
}

// Verifies the BLOCKS edge exists; without it the dispatcher ran against an
// empty relation set and left a half-deleted block.
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
