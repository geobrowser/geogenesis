import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';
import { type Edit, type Op, decodeEdit, formatId } from '@geoprotocol/grc-20';

import { type Hex, decodeAbiParameters } from 'viem';

import { IPFS_GATEWAY_COUNT, getImagePathAtLevel } from '../utils';

/**
 * How old a profile declaration can be before a still-missing profile counts as dropped. The index
 * trails the chain by seconds to a minute, so a younger one is most likely still being indexed.
 */
export const INDEX_LAG_WINDOW_MS = 5 * 60 * 1000;

/** A personal space's on-chain profile publish: the topic declaration and the edit sent with it. */
export type ProfileDeclaration = {
  topicId: string;
  blockNumber: bigint;
  transactionHash: Hex;
  declaredAtMs: number;
  /** The `ipfs://` URI of the edit published in the same transaction, or null if there was none. */
  editUri: string | null;
};

export type ProfileRetryDecision =
  /** No profile publish on chain: publish one. */
  | { kind: 'publish-fresh' }
  /** Published recently: the index is most likely still catching up. Publish nothing. */
  | { kind: 'processing'; declaration: ProfileDeclaration }
  /** Published long enough ago that the index dropped it: republish the same edit. */
  | { kind: 'republish'; declaration: ProfileDeclaration };

/** What to do for a registered space whose index shows no profile. */
export function decideProfileRetry(declaration: ProfileDeclaration | null, now: number): ProfileRetryDecision {
  if (!declaration) return { kind: 'publish-fresh' };
  if (now - declaration.declaredAtMs < INDEX_LAG_WINDOW_MS) return { kind: 'processing', declaration };
  return { kind: 'republish', declaration };
}

/**
 * The edit URI in an EDITS_PUBLISHED log's data. The registry logs the `enter` payload as `bytes`,
 * and the SDK encodes that payload as an ABI `string` (`encodePublishEditToSpaceCalldata`).
 */
export function parseEditUriFromLogData(data: Hex): string | null {
  try {
    const [payload] = decodeAbiParameters([{ type: 'bytes' }], data);
    const [uri] = decodeAbiParameters([{ type: 'string' }], payload);
    return uri.startsWith('ipfs://') ? uri : null;
  } catch {
    return null;
  }
}

/** Thrown when the original profile edit can't be read back, so nothing is republished. */
export class ProfileRecoveryError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ProfileRecoveryError';
  }
}

/** Thrown when the profile was published moments ago and the index has not caught up yet. */
export class ProfileStillProcessingError extends Error {
  constructor(
    readonly declaredAtMs: number,
    /** The person entity the profile was declared with. */
    readonly topicId: string
  ) {
    super('Your profile is still being saved. This can take a few minutes.');
    this.name = 'ProfileStillProcessingError';
  }
}

/**
 * Decodes the original profile edit and checks that it is this space's profile for this topic, so
 * a republish reuses its exact ids. Throws rather than returning something to rebuild from: fresh
 * ids would write a second person entity once the original is indexed.
 */
export function parseOriginalProfileEdit(bytes: Uint8Array, spaceId: string, topicId: string): Edit {
  let edit: Edit;
  try {
    edit = decodeEdit(bytes);
  } catch (error) {
    throw new ProfileRecoveryError('The original profile edit could not be decoded.', { cause: error });
  }
  if (!edit.authors.some(author => formatId(author) === spaceId)) {
    throw new ProfileRecoveryError('The original profile edit was not authored by this space.');
  }
  if (!edit.ops.some(op => op.type === 'createEntity' && formatId(op.id) === topicId)) {
    throw new ProfileRecoveryError('The original profile edit does not create the declared profile entity.');
  }
  return edit;
}

/** Fetches an `ipfs://` edit through the app's gateways in fallback order. */
export async function fetchOriginalProfileEdit(uri: string, fetchFn: typeof fetch = fetch): Promise<Uint8Array> {
  let lastError: unknown = null;
  for (let level = 0; level < IPFS_GATEWAY_COUNT; level++) {
    try {
      const response = await fetchFn(getImagePathAtLevel(uri, level));
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
      lastError = new Error(`IPFS gateway answered ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw new ProfileRecoveryError('The original profile edit could not be fetched.', { cause: lastError });
}

/**
 * The ops to republish: the original edit's ops with the same ids, so indexing both the original and
 * the republish upserts one profile rather than writing two.
 *
 * - `name` replaces the person's Name value. It is the same value id, so the edit indexed last wins.
 * - `avatarOps` are added only when the original has no avatar. A relation upsert can't retarget
 *   `to`, so a second avatar relation would leave the person with two avatars.
 */
export function buildRecoveryOps({
  originalOps,
  topicId,
  name,
  avatarOps,
}: {
  originalOps: readonly Op[];
  topicId: string;
  name: string;
  avatarOps: readonly Op[];
}): Op[] {
  const ops = originalOps.map(op => {
    if (op.type !== 'createEntity' || formatId(op.id) !== topicId) return op;
    return {
      ...op,
      values: op.values.map(value =>
        formatId(value.property) === SystemIds.NAME_PROPERTY && value.value.type === 'text'
          ? { ...value, value: { ...value.value, value: name } }
          : value
      ),
    };
  });

  const hasAvatar = originalOps.some(
    op =>
      op.type === 'createRelation' &&
      formatId(op.from) === topicId &&
      formatId(op.relationType) === ContentIds.AVATAR_PROPERTY
  );
  if (!hasAvatar) ops.push(...avatarOps);

  return ops;
}
