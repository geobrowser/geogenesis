import { describe, expect, it } from 'vitest';

import { createDebatePageOutcome } from './debate-page-outcome';

function setup() {
  let clock = 1_000;
  const events: Record<string, unknown>[] = [];
  const outcome = createDebatePageOutcome({
    debateId: 'debate-1',
    emit: event => events.push(event),
    now: () => clock,
  });
  return {
    outcome,
    events,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

const idle = { ready: false, playing: false, autoplayBlocked: false, error: false };

describe('createDebatePageOutcome', () => {
  it('records a play as soon as the linked debate plays, with how long each stage took', () => {
    const { outcome, events, advance } = setup();
    advance(1_200);
    outcome.feed({ kind: 'shown' });
    advance(800);
    outcome.player({ ...idle, ready: true });
    advance(300);
    outcome.player({ ...idle, ready: true, playing: true });

    expect(events).toEqual([
      expect.objectContaining({
        debate_id: 'debate-1',
        outcome: 'played',
        shown_ms: 1_200,
        ready_ms: 2_000,
        played_ms: 2_300,
        reason: null,
      }),
    ]);
  });

  it('never sends measurement_version, which makes the collector reject an event with no measurement contract', () => {
    const { outcome, events } = setup();
    outcome.leave('pagehide');
    outcome.player({ ...idle, ready: true, playing: true });

    expect(events).toHaveLength(1);
    expect(events[0]).not.toHaveProperty('measurement_version');
    expect(events[0]).toMatchObject({ outcome_version: 'debate-page-v1' });
  });

  it('records once: leaving after a play, or a second play, sends nothing more', () => {
    const { outcome, events } = setup();
    outcome.feed({ kind: 'shown' });
    outcome.player({ ...idle, ready: true, playing: true });
    outcome.player({ ...idle, ready: true, playing: true });
    outcome.leave('pagehide');

    expect(events).toHaveLength(1);
  });

  it('names the lookup a visitor was still waiting on when they left', () => {
    const { outcome, events, advance } = setup();
    outcome.feed({ kind: 'loading', stage: 'media_readiness' });
    advance(11_000);
    outcome.leave('hidden');

    expect(events).toEqual([
      expect.objectContaining({
        outcome: 'not_played',
        reason: 'loading',
        detail: 'media_readiness',
        left_via: 'hidden',
        left_ms: 11_000,
        shown_ms: null,
      }),
    ]);
  });

  it.each([
    [{ kind: 'unavailable', detail: 'not_processed' } as const, undefined, 'unavailable', 'not_processed'],
    [{ kind: 'lookup_error' } as const, undefined, 'lookup_error', null],
    [{ kind: 'shown' } as const, undefined, 'media_loading', null],
    [{ kind: 'shown' } as const, { ...idle, ready: false }, 'media_loading', null],
    [{ kind: 'shown' } as const, { ...idle, ready: true, autoplayBlocked: true }, 'autoplay_blocked', null],
    [{ kind: 'shown' } as const, { ...idle, ready: true, error: true }, 'playback_error', null],
    [{ kind: 'shown' } as const, { ...idle, error: true }, 'playback_error', null],
    [{ kind: 'shown' } as const, { ...idle, ready: true }, 'not_started', null],
  ])('a visit left at %o with player %o fails as %s', (feed, player, reason, detail) => {
    const { outcome, events } = setup();
    outcome.feed(feed);
    if (player) outcome.player(player);
    outcome.leave('unmount');

    expect(events).toEqual([expect.objectContaining({ outcome: 'not_played', reason, detail })]);
  });

  it('tells a visitor who scrolled on apart from one whose debate never started', () => {
    const { outcome, events } = setup();
    outcome.feed({ kind: 'shown' });
    outcome.player({ ...idle, ready: true, autoplayBlocked: true });
    outcome.movedOn();
    outcome.leave('pagehide');

    expect(events).toEqual([expect.objectContaining({ reason: 'scrolled_away' })]);
  });

  it('still counts a play after scrolling away and back', () => {
    const { outcome, events } = setup();
    outcome.feed({ kind: 'shown' });
    outcome.movedOn();
    outcome.player({ ...idle, ready: true, playing: true });

    expect(events).toEqual([expect.objectContaining({ outcome: 'played' })]);
  });

  it('keeps the first time each stage was reached', () => {
    const { outcome, events, advance } = setup();
    advance(500);
    outcome.feed({ kind: 'shown' });
    outcome.player({ ...idle, ready: true });
    advance(5_000);
    outcome.feed({ kind: 'shown' });
    outcome.player({ ...idle, ready: true, autoplayBlocked: true });
    outcome.leave('hidden');

    expect(events).toEqual([expect.objectContaining({ shown_ms: 500, ready_ms: 500 })]);
  });

  // GEO-2965. The pair hold sits between "URLs in hand" and "playing". It must not move a visit into
  // a different reason, or `ready_ms`, or the split GEO-3074 is waiting on stops being comparable
  // across the change. It only names which part of `not_started` a visitor left in.
  it('reports a visitor who left during the pair hold as not_started, with the hold as the detail', () => {
    const { outcome, events, advance } = setup();
    outcome.feed({ kind: 'shown' });
    advance(400);
    outcome.player({ ...idle, ready: true, pairHeld: true });
    advance(900);
    outcome.leave('pagehide');

    expect(events).toEqual([
      expect.objectContaining({ outcome: 'not_played', reason: 'not_started', detail: 'pair_hold', ready_ms: 400 }),
    ]);
  });

  it('keeps media_loading for a visit that had no URLs yet, whatever the hold says', () => {
    const { outcome, events } = setup();
    outcome.feed({ kind: 'shown' });
    outcome.player({ ...idle, pairHeld: true });
    outcome.leave('hidden');

    expect(events).toEqual([expect.objectContaining({ reason: 'media_loading', ready_ms: null })]);
  });

  it('records the play when the hold lets go, with ready_ms still the moment the URLs landed', () => {
    const { outcome, events, advance } = setup();
    outcome.feed({ kind: 'shown' });
    advance(300);
    outcome.player({ ...idle, ready: true, pairHeld: true });
    advance(600);
    outcome.player({ ...idle, ready: true, playing: true, pairHeld: false });

    expect(events).toEqual([expect.objectContaining({ outcome: 'played', ready_ms: 300, played_ms: 900 })]);
  });

  it('never lets a failing emitter reach playback', () => {
    const outcome = createDebatePageOutcome({
      debateId: 'debate-1',
      emit: () => {
        throw new Error('collector down');
      },
      now: () => 0,
    });

    expect(() => outcome.player({ ...idle, ready: true, playing: true })).not.toThrow();
  });
});
