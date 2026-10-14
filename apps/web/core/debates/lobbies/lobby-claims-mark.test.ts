import { renderHook } from '@testing-library/react';

import { describe, expect, it } from 'vitest';

import type { DebateLobbyHighlights } from '../api';
import { useClaimsTabMark, useNewClaimListTabs } from './lobby-claims-mark';

type State = Pick<DebateLobbyHighlights, 'highlights' | 'room_vote'>;

const claim = (id: string) => ({ id, claim: id }) as DebateLobbyHighlights['highlights'][number]['claim'];
const highlight = (id: string, at = '2026-10-12T09:00:00Z') =>
  ({ claim: claim(id), highlighted_by: null, highlighted_at: at }) as DebateLobbyHighlights['highlights'][number];
const vote = (id: string) =>
  ({ vote_id: id, claim: claim('c-vote') }) as NonNullable<DebateLobbyHighlights['room_vote']>;

describe('useClaimsTabMark', () => {
  it('marks a room vote or highlight that arrives while on People, and clears once Claims opens', () => {
    const empty: State = { highlights: [], room_vote: null };
    const { result, rerender } = renderHook(({ state, viewing }) => useClaimsTabMark(state, viewing), {
      initialProps: { state: undefined as State | undefined, viewing: false },
    });
    expect(result.current).toBe(false);

    rerender({ state: empty, viewing: false });
    expect(result.current).toBe(false);

    rerender({ state: { highlights: [], room_vote: vote('v1') }, viewing: false });
    expect(result.current).toBe(true);

    rerender({ state: { highlights: [], room_vote: vote('v1') }, viewing: true });
    expect(result.current).toBe(false);

    rerender({ state: { highlights: [], room_vote: vote('v1') }, viewing: false });
    expect(result.current).toBe(false);

    rerender({ state: { highlights: [highlight('h1')], room_vote: vote('v1') }, viewing: false });
    expect(result.current).toBe(true);
  });

  it('counts what was there on first load as seen', () => {
    const { result } = renderHook(() =>
      useClaimsTabMark({ highlights: [highlight('h1')], room_vote: vote('v1') }, false)
    );
    expect(result.current).toBe(false);
  });

  it('marks a claim highlighted again after its highlight was seen and removed', () => {
    const { result, rerender } = renderHook(({ state, viewing }) => useClaimsTabMark(state, viewing), {
      initialProps: { state: { highlights: [highlight('h1')], room_vote: null } as State, viewing: false },
    });
    rerender({ state: { highlights: [], room_vote: null }, viewing: false });
    rerender({ state: { highlights: [highlight('h1', '2026-10-12T09:20:00Z')], room_vote: null }, viewing: false });
    expect(result.current).toBe(true);
  });

  it('does not mark a vote that ended', () => {
    const { result, rerender } = renderHook(({ state }) => useClaimsTabMark(state, false), {
      initialProps: { state: { highlights: [], room_vote: vote('v1') } as State },
    });
    rerender({ state: { highlights: [], room_vote: null } });
    expect(result.current).toBe(false);
  });

  it('marks a claim list added while on People (GEO-3274)', () => {
    const empty: State = { highlights: [], room_vote: null };
    const { result, rerender } = renderHook(({ lists, viewing }) => useClaimsTabMark(empty, viewing, lists), {
      initialProps: { lists: [{ entity_id: 'p1' }], viewing: false },
    });
    expect(result.current).toBe(false);

    rerender({ lists: [{ entity_id: 'p1' }, { entity_id: 'p2' }], viewing: false });
    expect(result.current).toBe(true);

    rerender({ lists: [{ entity_id: 'p1' }, { entity_id: 'p2' }], viewing: true });
    expect(result.current).toBe(false);
  });
});

describe('useNewClaimListTabs', () => {
  it('dots only tabs added after first render, until each is opened', () => {
    const { result, rerender } = renderHook(({ keys, open }) => useNewClaimListTabs(keys, open), {
      initialProps: { keys: ['list:a'], open: 'room' },
    });
    expect([...result.current]).toEqual([]);

    rerender({ keys: ['list:a', 'list:b', 'list:c'], open: 'room' });
    expect([...result.current]).toEqual(['list:b', 'list:c']);

    rerender({ keys: ['list:a', 'list:b', 'list:c'], open: 'list:b' });
    expect([...result.current]).toEqual(['list:c']);

    // Gone, it is not new; back again, it was seen.
    rerender({ keys: ['list:a', 'list:b'], open: 'room' });
    expect([...result.current]).toEqual([]);
  });
});
