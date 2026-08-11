import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import type React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';
import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';

import { DebateExploreFeedCard } from './debate-explore-feed-card';

const mocks = vi.hoisted(() => ({
  debatesEnabled: true,
  debateQuery: { data: undefined as Debate | undefined, isError: false },
  mediaQuery: { data: undefined as { artifacts: { kind: string }[] } | undefined, isError: false },
}));

type ObserverRecord = {
  callback: IntersectionObserverCallback;
  elements: Set<Element>;
  instance: IntersectionObserver;
};

let observers: ObserverRecord[] = [];

vi.mock('~/core/state/feature-flags', () => ({
  useDebatesEnabled: () => mocks.debatesEnabled,
}));

vi.mock('~/core/debates/hooks', () => ({
  useDebate: () => mocks.debateQuery,
  useDebateMedia: () => mocks.mediaQuery,
}));

vi.mock('~/core/debates/use-debate-votes', () => ({
  useDebateVotes: () => ({
    sharePercentFor: () => null,
    isMyPick: () => false,
    hasVoted: false,
    isVoting: false,
    castVote: vi.fn(),
  }),
}));

vi.mock('~/core/debates/browse/debate-feed-player', () => ({
  DebateFeedPlayer: ({ debate, active }: { debate: Debate; active: boolean }) => (
    <div data-testid="player" data-debate={debate.id} data-active={active} />
  ),
}));

vi.mock('~/core/debates/browse/use-debate-share-action', () => ({
  useDebateShareAction: () => ({ state: 'ready', method: 'share', tooltipMessage: undefined, onActivate: vi.fn() }),
}));

vi.mock('~/core/debates/browse/debate-claims-panel', () => ({
  DebateClaimsPanel: ({ onClose }: { onClose: () => void }) => (
    <aside data-testid="claims-panel">
      <button type="button" onClick={onClose}>
        Close
      </button>
    </aside>
  ),
}));

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock('~/design-system/fallback-image', () => ({
  FallbackImage: () => <div data-testid="image" />,
}));

vi.mock('~/partials/entity-page/entity-row-actions', () => ({
  EntityRowActions: ({ children }: { children: React.ReactNode }) => <div data-testid="row-actions">{children}</div>,
}));

const item: ExploreFeedItem = {
  entityId: 'fd51f9352063461780397b672b23364c',
  spaceId: 'space-1',
  spaceName: 'Fashion',
  spaceImage: null,
  types: [{ id: 'fd51f93520634617be397b672b23364c', name: 'Debate' }],
  createdAtSec: 0,
  title: 'Fast fashion should be discouraged with higher taxation',
  description: null,
  imageUrl: null,
  commentCount: 3,
  isMemberOrEditor: true,
  hasPendingMembershipRequest: false,
};

function watchableDebate(): Debate {
  return {
    id: 'fd51f935-2063-4617-8039-7b672b23364c',
    status: 'complete',
    recordings: [{ participant_slot: 1 }, { participant_slot: 2 }],
    participants: [],
  } as unknown as Debate;
}

beforeEach(() => {
  vi.clearAllMocks();
  observers = [];
  mocks.debatesEnabled = true;
  mocks.debateQuery = { data: undefined, isError: false };
  mocks.mediaQuery = { data: undefined, isError: false };

  class MockIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = '0px';
    readonly scrollMargin = '0px';
    readonly thresholds = [0.6];
    private readonly record: ObserverRecord;

    constructor(callback: IntersectionObserverCallback) {
      this.record = { callback, elements: new Set(), instance: this };
      observers.push(this.record);
    }

    observe(element: Element) {
      this.record.elements.add(element);
    }

    unobserve(element: Element) {
      this.record.elements.delete(element);
    }

    disconnect() {
      this.record.elements.clear();
    }

    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function intersectAll(ratio: number) {
  act(() => {
    for (const record of observers) {
      for (const element of record.elements) {
        record.callback(
          [{ target: element, isIntersecting: ratio > 0, intersectionRatio: ratio } as IntersectionObserverEntry],
          record.instance
        );
      }
    }
  });
}

function renderCard() {
  return render(<DebateExploreFeedCard item={item} fallback={<div data-testid="fallback" />} />);
}

describe('DebateExploreFeedCard', () => {
  it('renders the fallback when the debates feature is off', () => {
    mocks.debatesEnabled = false;
    renderCard();
    expect(screen.getByTestId('fallback')).toBeDefined();
    expect(screen.queryByTestId('player')).toBeNull();
  });

  it('shows the card chrome with video placeholders while the debate loads', () => {
    renderCard();
    expect(screen.getByText('Fast fashion should be discouraged with higher taxation')).toBeDefined();
    expect(screen.getByText('View all')).toBeDefined();
    expect(screen.queryByTestId('player')).toBeNull();
    expect(screen.queryByTestId('fallback')).toBeNull();
  });

  it('renders the fallback when the debate is not watchable', () => {
    mocks.debateQuery = { data: { ...watchableDebate(), status: 'aborted' } as Debate, isError: false };
    renderCard();
    expect(screen.getByTestId('fallback')).toBeDefined();
  });

  it('renders the fallback when the final video was never processed', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [] }, isError: false };
    renderCard();
    expect(screen.getByTestId('fallback')).toBeDefined();
  });

  it('renders the player once the debate is watchable and processed, activating in view', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    renderCard();

    const player = screen.getByTestId('player');
    expect(player.getAttribute('data-active')).toBe('false');

    intersectAll(0.7);
    expect(screen.getByTestId('player').getAttribute('data-active')).toBe('true');

    intersectAll(0.4);
    expect(screen.getByTestId('player').getAttribute('data-active')).toBe('false');
  });

  it('shows Claims and Share actions once the debate is ready, opening the claims panel on demand', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    renderCard();

    expect(screen.getByRole('button', { name: 'Share debate video' })).toBeDefined();

    expect(screen.queryByTestId('claims-panel')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Claims' }));
    expect(screen.getByTestId('claims-panel')).toBeDefined();

    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByTestId('claims-panel')).toBeNull();
  });

  it('hides Claims and Share while the debate is still loading', () => {
    renderCard();
    expect(screen.queryByRole('button', { name: 'Claims' })).toBeNull();
    expect(screen.queryByRole('button', { name: /share/i })).toBeNull();
  });
});
