'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Claim votes a signed-out visitor cast on this device, held until they save them with an account
 * (GEO-3214).
 *
 * A plain store over localStorage rather than a jotai atom: the navbar reads the count for its
 * "Save N votes" pill, and the navbar's tests replace `jotai` wholesale, so a module-level atom in
 * its import graph fails that suite at collection.
 *
 * Nothing here is written to the graph. A vote only counts once `LocalVotesSaver` publishes it from
 * a real account, so the store opens no write path anybody could abuse.
 */
export type LocalVoteDirection = 'positive' | 'negative';

export type LocalVote = {
  claimId: string;
  spaceId: string;
  direction: LocalVoteDirection;
  /** The claim's sentence, for the save sheet's reminder chips. */
  title: string;
  votedAt: number;
};

export type LocalVotesState = {
  votes: LocalVote[];
  /** How many times the save sheet has opened on its own, and been closed. Drives when it asks again. */
  prompt: { shownCount: number; dismissCount: number };
  /**
   * Set when a save prompt starts a sign-in. Only a sign-in a save prompt started saves the votes;
   * any other sign-in clears them, so one person's votes on a shared browser never land in another
   * person's account. `confirmed` once the account it was for has signed in.
   */
  save: { requestedAt: number; confirmed: boolean } | null;
};

export const LOCAL_VOTES_STORAGE_KEY = 'geo:local-votes:v1';
/** Past this the oldest vote is dropped. One transaction per vote on save, so this bounds that too. */
export const LOCAL_VOTES_CAP = 50;
export const LOCAL_VOTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** A save prompt's sign-in has to finish within this to count as the one it started. */
export const SAVE_REQUEST_TTL_MS = 30 * 60 * 1000;

const EMPTY: LocalVotesState = { votes: [], prompt: { shownCount: 0, dismissCount: 0 }, save: null };

const listeners = new Set<() => void>();
let cache: { raw: string | null; state: LocalVotesState } | null = null;
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
    typeof vote.claimId === 'string' &&
    typeof vote.spaceId === 'string' &&
    (vote.direction === 'positive' || vote.direction === 'negative') &&
    typeof vote.votedAt === 'number'
  );
}

function parse(raw: string | null, now = Date.now()): LocalVotesState {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as Partial<LocalVotesState>;
    const votes = (Array.isArray(parsed.votes) ? parsed.votes : [])
      .filter(isVote)
      .map(vote => ({ ...vote, title: typeof vote.title === 'string' ? vote.title : '' }))
      .filter(vote => now - vote.votedAt < LOCAL_VOTE_TTL_MS);
    return {
      votes,
      prompt: {
        shownCount: Number(parsed.prompt?.shownCount) || 0,
        dismissCount: Number(parsed.prompt?.dismissCount) || 0,
      },
      save:
        parsed.save && typeof parsed.save.requestedAt === 'number'
          ? { requestedAt: parsed.save.requestedAt, confirmed: Boolean(parsed.save.confirmed) }
          : null,
    };
  } catch {
    return EMPTY;
  }
}

export function readLocalVotes(): LocalVotesState {
  if (typeof window === 'undefined') return EMPTY;
  if (memoryOnly) return memoryOnly;
  const raw = readRaw();
  if (cache && cache.raw === raw) return cache.state;
  cache = { raw, state: parse(raw) };
  return cache.state;
}

function write(next: LocalVotesState) {
  const empty = next.votes.length === 0 && next.save === null;
  // Nothing left to hold: forget the prompt history too, so a visitor who saved (or was cleared)
  // and later votes signed out again is asked afresh.
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

/** The side this device holds on a claim, or null. Selected down so a feed row re-renders only for its own claim. */
export function useLocalVote(claimId: string, spaceId: string): LocalVoteDirection | null {
  const select = useCallback(
    () => readLocalVotes().votes.find(vote => vote.claimId === claimId && vote.spaceId === spaceId)?.direction ?? null,
    [claimId, spaceId]
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

const sameClaim = (vote: LocalVote, claimId: string, spaceId: string) =>
  vote.claimId === claimId && vote.spaceId === spaceId;

export type LocalVoteChange = { action: 'cast' | 'switch' | 'remove'; count: number };

/**
 * A signed-out press: the side the visitor pressed, or none if they pressed the side they hold — the
 * same toggle the pills have signed in.
 */
export function toggleLocalVote({ claimId, spaceId, direction, title }: Omit<LocalVote, 'votedAt'>): LocalVoteChange {
  const current = readLocalVotes();
  const held = current.votes.find(vote => sameClaim(vote, claimId, spaceId));
  const others = current.votes.filter(vote => !sameClaim(vote, claimId, spaceId));
  if (held?.direction === direction) {
    write({ ...current, votes: others });
    return { action: 'remove', count: others.length };
  }
  const votes = [...others, { claimId, spaceId, direction, title, votedAt: Date.now() }].slice(-LOCAL_VOTES_CAP);
  write({ ...current, votes });
  return { action: held ? 'switch' : 'cast', count: votes.length };
}

export function removeLocalVote(claimId: string, spaceId: string) {
  const current = readLocalVotes();
  if (!current.votes.some(vote => sameClaim(vote, claimId, spaceId))) return;
  write({ ...current, votes: current.votes.filter(vote => !sameClaim(vote, claimId, spaceId)) });
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

export function markSaveRequested() {
  update(current => ({ ...current, save: { requestedAt: Date.now(), confirmed: false } }));
}

export function clearSaveRequested() {
  update(current => (current.save && !current.save.confirmed ? { ...current, save: null } : current));
}

/** Signed out mid-save: whatever was confirmed was for that account, not whoever signs in next. */
export function resetSaveRequest() {
  update(current => (current.save ? { ...current, save: null } : current));
}

export function confirmSaveRequest() {
  update(current => (current.save ? { ...current, save: { ...current.save, confirmed: true } } : current));
}

/** Whether a save prompt started the sign-in that just completed (or one already confirmed). */
export function isSaveRequestLive(state: LocalVotesState, now = Date.now()) {
  if (!state.save) return false;
  return state.save.confirmed || now - state.save.requestedAt < SAVE_REQUEST_TTL_MS;
}
