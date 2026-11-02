import { ID } from '~/core/id';

import type { Debate } from './api';

/**
 * Who may remove a debate, and who may restore one (GEO-2785).
 *
 * geo-chat decides; these only decide what to *offer*. They mirror its rules so the action is shown
 * to exactly the people it would accept:
 *
 * - Remove (`/hide`): a participant in the debate, or an editor of the debate's space. Only a
 *   completed debate — geo-chat refuses the rest with `debate_not_complete`.
 * - Restore (`/unhide`): an editor of the space, always; a participant only a removal they made.
 *
 * Editorship here is the graph's (`useAccessControl`), and geo-chat's is its snapshot of the same
 * on-chain editors (`space_membership_snapshots`). They can disagree for as long as that snapshot
 * lags; when they do, geo-chat's refusal is what the viewer sees.
 */
export function canRemoveDebate({
  debate,
  viewerUserId,
  viewerPersonalSpaceId,
  isSpaceEditor,
}: {
  debate: Pick<Debate, 'status' | 'participants'>;
  viewerUserId: string | null;
  viewerPersonalSpaceId: string | null | undefined;
  isSpaceEditor: boolean;
}): boolean {
  if (debate.status !== 'complete') return false;
  if (isSpaceEditor) return true;
  return isDebateParticipant(debate, viewerUserId, viewerPersonalSpaceId);
}

export function isDebateParticipant(
  debate: Pick<Debate, 'participants'>,
  viewerUserId: string | null,
  viewerPersonalSpaceId: string | null | undefined
): boolean {
  return (debate.participants ?? []).some(
    participant =>
      (viewerUserId != null && participant.user_id === viewerUserId) ||
      (viewerPersonalSpaceId != null &&
        participant.profile_space_id != null &&
        ID.equals(participant.profile_space_id, viewerPersonalSpaceId))
  );
}

/**
 * Whether to offer Restore on a removed debate.
 *
 * A removed debate is unreadable to everyone, its participants included, so the page cannot ask
 * geo-chat who removed it. What it can know is an editor (from the graph), and a removal this
 * browser made, which {@link rememberOwnRemoval} records from the hide response. A participant who
 * removed a debate from another device sees no Restore here; an editor still can, and geo-chat
 * remains the authority either way.
 */
export function canRestoreDebate({
  debateId,
  viewerUserId,
  isSpaceEditor,
  storage,
}: {
  debateId: string;
  viewerUserId: string | null;
  isSpaceEditor: boolean;
  storage?: Storage | null;
}): boolean {
  if (isSpaceEditor) return true;
  if (!viewerUserId) return false;
  return readOwnRemovals(storage)[ID.uuidToHex(debateId)] === viewerUserId;
}

/**
 * Whether an entity id is one geo-chat could have minted. geo-chat creates every debate with
 * `Uuid::now_v7()`, and the Debate entity takes that id; an id of any other version was not minted
 * there, so geo-chat's "not found" for it says nothing about whether it was removed.
 */
export function isGeoChatDebateId(entityId: string): boolean {
  const hex = ID.uuidToHex(entityId);
  return /^[0-9a-f]{32}$/.test(hex) && hex[12] === '7';
}

/**
 * geo-chat's definitive answer that a debate it minted is not there — removed, in product terms.
 * The one 404 the entity page fails closed on; see `fetchDebateVisibility`.
 */
export function isRemovedDebateAnswer(debateId: string, status: number, code: string | null): boolean {
  return status === 404 && code === 'debate_not_found' && isGeoChatDebateId(debateId);
}

const OWN_REMOVALS_KEY = 'geo:debate-removals';

type OwnRemovals = Record<string, string>;

function defaultStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readOwnRemovals(storage: Storage | null | undefined = defaultStorage()): OwnRemovals {
  if (!storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(OWN_REMOVALS_KEY) ?? '{}') as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as OwnRemovals) : {};
  } catch {
    return {};
  }
}

function writeOwnRemovals(removals: OwnRemovals, storage: Storage | null | undefined) {
  if (!storage) return;
  try {
    if (Object.keys(removals).length === 0) storage.removeItem(OWN_REMOVALS_KEY);
    else storage.setItem(OWN_REMOVALS_KEY, JSON.stringify(removals));
  } catch {
    /* A convenience only: without it, the remover falls back to what an editor would see. */
  }
}

/** Records who removed a debate, from geo-chat's own answer rather than from who clicked. */
export function rememberOwnRemoval(
  debateId: string,
  hiddenByUserId: string | null,
  storage: Storage | null | undefined = defaultStorage()
) {
  if (!hiddenByUserId) return;
  writeOwnRemovals({ ...readOwnRemovals(storage), [ID.uuidToHex(debateId)]: hiddenByUserId }, storage);
}

export function forgetOwnRemoval(debateId: string, storage: Storage | null | undefined = defaultStorage()) {
  const removals = readOwnRemovals(storage);
  const key = ID.uuidToHex(debateId);
  if (!(key in removals)) return;
  delete removals[key];
  writeOwnRemovals(removals, storage);
}

/** What to tell someone whose remove or restore geo-chat refused, by its error code. */
export function debateVisibilityErrorMessage(code: string | null, action: 'remove' | 'restore'): string {
  switch (code) {
    case 'debate_visibility_forbidden':
      return action === 'restore'
        ? 'Only an editor of this space, or the person who removed it, can restore this debate.'
        : 'Only a debater or an editor of this space can remove this debate.';
    case 'debate_not_complete':
      return 'Only a finished debate can be removed.';
    case 'hide_reason_too_long':
      return 'That reason is too long.';
    case 'debate_not_found':
      return action === 'restore'
        ? 'You can’t restore this debate.'
        : 'This debate could not be found. It may already have been removed.';
    default:
      return action === 'restore'
        ? 'Could not restore this debate. Try again.'
        : 'Could not remove this debate. Try again.';
  }
}
