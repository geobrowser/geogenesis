import { renderHook } from '@testing-library/react';

import { describe, expect, it } from 'vitest';

import type { DebateLobbyHighlights } from '../api';
import { useClaimsTabMark } from './lobby-claims-mark';

type State = Pick<DebateLobbyHighlights, 'highlights' | 'room_vote'>;

const claim = (id: string) => ({ id, claim: id }) as DebateLobbyHighlights['highlights'][number]['claim'];
const highlight = (id: string) =>
  ({ claim: claim(id), highlighted_by: null }) as DebateLobbyHighlights['highlights'][number];
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

  it('does not mark a vote that ended', () => {
    const { result, rerender } = renderHook(({ state }) => useClaimsTabMark(state, false), {
      initialProps: { state: { highlights: [], room_vote: vote('v1') } as State },
    });
    rerender({ state: { highlights: [], room_vote: null } });
    expect(result.current).toBe(false);
  });
});
