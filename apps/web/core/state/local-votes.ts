'use client';

import { useCallback, useSyncExternalStore } from 'react';

import type { ResponseKind } from '~/core/responses/entity-response';

/**
 * Votes a signed-out visitor cast on this device — a side on a claim, or an up/downvote — held until
 * they save them with an account (GEO-3214).
 *
 * A plain store over localStorage rather than a jotai atom: the navbar reads the count for its
 * "Save N votes" pill, and the navbar's tests replace `jotai` wholesale, so a module-level atom in
 * its import graph fails that suite at collection. Same shape, and the same reason, as
 * `core/debates/watched-debates.ts`.
 *
 * Nothing here is written to the graph. A vote only counts once `LocalVotesSaver` publishes it from
 * a real account, so the store opens no write path anybody could abuse.
 */
export type LocalVoteDirection = 'positive' | 'negative';

export type LocalVote = {
  entityId: string;
  spaceId: string;
  /** `stance` for a side on a claim, `curation` for an up/downvote. One vote per entity, space and kind. */
  responseKind: ResponseKind;
  direction: LocalVoteDirection;
  /** The claim's sentence or the entity's name, for the save sheet's reminder chips. */
  title: string;
  votedAt: number;
};

export type LocalVotesState = {
  votes: LocalVote[];
  /** How many times the save sheet has opened on its own, and been closed. Drives when it asks again. */
  prompt: { shownCount: number; dismissCount: number };
  /**
   * The account a save prompt signed in, once it has. Only a sign-in a save prompt started saves the
   * votes, and only to the account it signed in; any other sign-in clears them, so one person's
   * votes on a shared browser never land in another person's account (see `LocalVotesSaver`).
   */
  save: { accountId: string } | null;
};

export const LOCAL_VOTES_STORAGE_KEY = 'geo:local-votes:v1';
/** Past this the oldest vote is dropped. One transaction per vote on save, so this bounds that too. */
export const LOCAL_VOTES_CAP = 50;
export const LOCAL_VOTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const EMPTY: LocalVotesState = { votes: [], prompt: { shownCount: 0, dismissCount: 0 }, save: null };

const listeners = new Set<() => void>();
/**
 * The last parse, valid while storage holds the same string and no vote in it has expired since. A
 * tab can stay open past a vote's 30 days, and the string alone would keep serving it — and a later
 * toggle would write it back.
 */
let cache: { raw: string | null; state: LocalVotesState; expiresAt: number } | null = null;
/** Only when storage throws (private mode, quota): the session still works, it just doesn't persist. */
let memoryOnly: LocalVotesState | null = null;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(LOCAL_VOTES_STORAGE_KEY);
  } catch {
    return null;
  }
}

function isVote(value: unknown): value is LocalVote {
  const vote = value as LocalVote;
  return (
    typeof vote === 'object' &&
    vote !== null &&
    typeof vote.entityId === 'string' &&
    (vote.responseKind === 'stance' || vote.responseKind === 'curation') &&
    typeof vote.spaceId === 'string' &&
    (vote.direction === 'positive' || vote.direction === 'negative') &&
    typeof vote.votedAt === 'number'
  );
}

/**
 * The first build of this store held claim sides only, as `claimId` with no kind. Read those as the
 * stance votes they were, rather than dropping votes someone cast on the preview.
 */
function withoutLegacyShape(value: unknown): unknown {
  const legacy = value as { claimId?: unknown; entityId?: unknown; responseKind?: unknown };
  if (typeof legacy !== 'object' || legacy === null || legacy.entityId !== undefined) return value;
  if (typeof legacy.claimId !== 'string') return value;
  const { claimId, ...rest } = legacy;
  return { ...rest, entityId: claimId, responseKind: legacy.responseKind ?? 'stance' };
}

/**
 * Nothing left to hold: no votes, and no save bound to an account. The prompt history goes with them,
 * so a visitor whose votes were saved, cleared or expired is asked afresh about the next ones.
 */
function holdsNothing(state: LocalVotesState) {
  return state.votes.length === 0 && state.save === null;
}

function parse(raw: string | null, now = Date.now()): LocalVotesState {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as Partial<LocalVotesState>;
    const votes = (Array.isArray(parsed.votes) ? parsed.votes : [])
      .map(withoutLegacyShape)
      .filter(isVote)
      .map(vote => ({ ...vote, title: typeof vote.title === 'string' ? vote.title : '' }))
      .filter(vote => now - vote.votedAt < LOCAL_VOTE_TTL_MS);
    const state: LocalVotesState = {
      votes,
      prompt: {
        shownCount: Number(parsed.prompt?.shownCount) || 0,
        dismissCount: Number(parsed.prompt?.dismissCount) || 0,
      },
      save: parsed.save && typeof parsed.save.accountId === 'string' ? { accountId: parsed.save.accountId } : null,
    };
    // Every vote expired: the same clean slate as removing the last one, or the old asks would be
    // counted against new votes and the sheet would never ask about them.
    return holdsNothing(state) ? EMPTY : state;
  } catch {
    return EMPTY;
  }
}

export function readLocalVotes(): LocalVotesState {
  if (typeof window === 'undefined') return EMPTY;
  if (memoryOnly) return memoryOnly;
  const raw = readRaw();
  const now = Date.now();
  if (cache && cache.raw === raw && now < cache.expiresAt) return cache.state;
  const state = parse(raw, now);
  const oldest = Math.min(...state.votes.map(vote => vote.votedAt));
  cache = { raw, state, expiresAt: oldest + LOCAL_VOTE_TTL_MS };
  return cache.state;
}

function write(next: LocalVotesState) {
  const empty = holdsNothing(next);
  const stored = empty ? EMPTY : next;
  try {
    if (empty) window.localStorage.removeItem(LOCAL_VOTES_STORAGE_KEY);
    else window.localStorage.setItem(LOCAL_VOTES_STORAGE_KEY, JSON.stringify(stored));
    memoryOnly = null;
  } catch {
    memoryOnly = stored;
  }
  cache = null;
  listeners.forEach(listener => listener());
}

function update(change: (current: LocalVotesState) => LocalVotesState) {
  write(change(readLocalVotes()));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab voting, saving or clearing is this tab's news too.
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === LOCAL_VOTES_STORAGE_KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

const serverSnapshot = () => EMPTY;

export function useLocalVotes(): LocalVotesState {
  return useSyncExternalStore(subscribe, readLocalVotes, serverSnapshot);
}

/** The side this device holds, or null. Selected down so a feed row re-renders only for its own vote. */
export function useLocalVote(
  entityId: string,
  spaceId: string,
  responseKind: ResponseKind | null
): LocalVoteDirection | null {
  const select = useCallback(
    () =>
      responseKind === null
        ? null
        : (readLocalVotes().votes.find(vote => sameVote(vote, { entityId, spaceId, responseKind }))?.direction ?? null),
    [entityId, spaceId, responseKind]
  );
  return useSyncExternalStore(subscribe, select, () => null);
}

export function useLocalVoteCount(): number {
  return useSyncExternalStore(
    subscribe,
    () => readLocalVotes().votes.length,
    () => 0
  );
}

export type LocalVoteKey = Pick<LocalVote, 'entityId' | 'spaceId' | 'responseKind'>;

const sameVote = (vote: LocalVote, key: LocalVoteKey) =>
  vote.entityId === key.entityId && vote.spaceId === key.spaceId && vote.responseKind === key.responseKind;

export type LocalVoteChange = { action: 'cast' | 'switch' | 'remove'; count: number };

/**
 * A signed-out press: the side the visitor pressed, or none if they pressed the side they hold — the
 * same toggle the controls have signed in.
 */
export function toggleLocalVote(next: Omit<LocalVote, 'votedAt'>): LocalVoteChange {
  const current = readLocalVotes();
  const held = current.votes.find(vote => sameVote(vote, next));
  const others = current.votes.filter(vote => !sameVote(vote, next));
  if (held?.direction === next.direction) {
    write({ ...current, votes: others });
    return { action: 'remove', count: others.length };
  }
  const votes = [...others, { ...next, votedAt: Date.now() }].slice(-LOCAL_VOTES_CAP);
  write({ ...current, votes });
  return { action: held ? 'switch' : 'cast', count: votes.length };
}

export function removeLocalVote(key: LocalVoteKey) {
  const current = readLocalVotes();
  if (!current.votes.some(vote => sameVote(vote, key))) return;
  write({ ...current, votes: current.votes.filter(vote => !sameVote(vote, key)) });
}

/**
 * Whether `vote` is still the one this device holds: not removed, switched or re-cast since it was
 * read. A write that awaited anything re-checks this before publishing, so a newer press wins.
 */
export function isLocalVoteCurrent(vote: LocalVote) {
  return readLocalVotes().votes.some(
    held => sameVote(held, vote) && held.direction === vote.direction && held.votedAt === vote.votedAt
  );
}

export function clearLocalVotes() {
  write(EMPTY);
}

export function recordSavePromptShown() {
  update(current => ({ ...current, prompt: { ...current.prompt, shownCount: current.prompt.shownCount + 1 } }));
}

export function recordSavePromptDismissed() {
  update(current => ({ ...current, prompt: { ...current.prompt, dismissCount: current.prompt.dismissCount + 1 } }));
}

/** A save prompt's sign-in completed for `accountId`: these votes are that account's to publish. */
export function bindSaveToAccount(accountId: string) {
  update(current => ({ ...current, save: { accountId } }));
}
