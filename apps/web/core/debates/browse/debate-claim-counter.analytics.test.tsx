import { cleanup, fireEvent, render } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { StackedCard, TickerWindow } from '~/core/debates/claim-ticker';

import { DebateClaimCounter } from './debate-claim-counter';

// The real `ActionSurface`, unlike the counter's main suite: what is under test is whether each
// claim in the list is a surface analytics can measure and attribute.
const { capture } = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock('~/core/analytics', () => ({ capture, analyticsContextRevision: () => 0 }));
vi.mock('./use-debate-claim-response', () => ({
  useDebateClaimResponse: () => ({
    responseKind: 'stance',
    summary: { percent: null },
    control: { viewerPosition: null, canRespond: true, respond: vi.fn(), actionTitle: () => '' },
  }),
}));

const observed = new Set<Element>();
beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe = (element: Element) => observed.add(element);
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  observed.clear();
});

const said = (id: string, saidMs: number): StackedCard => ({
  window: {
    claim: { id, text: `Claim ${id}`, spaceId: 'space-1' },
    startMs: saidMs,
    endMs: saidMs + 8_000,
  } as unknown as TickerWindow,
  opacity: 1,
});

// Copilot, #2843: with `asChild`, a surface measures only through an `ActionSurfaceDiv` under it,
// and the card was a plain div, so no claim in the list ever reported an impression.
it('measures each claim in the list as its own surface', () => {
  const { container } = render(
    <DebateClaimCounter
      history={[said('a', 1_000), said('b', 2_000)]}
      playheadMs={30_000}
      name="Preston"
      rowsByClaimId={new Map()}
      entitiesByClaimId={new Map()}
      onAnswered={() => {}}
    />
  );
  fireEvent.click(container.querySelector('[data-claim-count]') as HTMLElement);

  for (const id of ['a', 'b']) {
    expect(observed.has(container.querySelector(`[data-claim-list-card="${id}"]`) as Element)).toBe(true);
  }
});
