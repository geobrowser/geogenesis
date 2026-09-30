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
