import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import * as React from 'react';

import { describe, expect, it, vi } from 'vitest';

import type { CuratorLeaderboardResult } from '~/core/community/curator-leaderboard-types';

import { CuratorLeaderboardSection } from './curator-leaderboard-section';

const CURATOR_SPACE_ID = 'd4bee0928fb5405baba3b1513f085835';
const VIEWER_SPACE_ID = '4c81561d1f9541319cdddd20ab831ba2';

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: VIEWER_SPACE_ID, isRegistered: true }),
}));

vi.mock('~/design-system/avatar', () => ({
  Avatar: () => <div data-testid="avatar" />,
}));

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

function row(overrides: Partial<CuratorLeaderboardResult['rows'][number]> = {}) {
  return {
    curatorSpaceId: CURATOR_SPACE_ID,
    name: 'Ada',
    avatarUrl: null,
    rankings: 3,
    newsStories: 1,
    votes: 2,
    submissions: 0,
    activityScore: 4,
    rank: 1,
    isCurrentUser: false,
    ...overrides,
  };
}

function renderSection(initialData: CuratorLeaderboardResult) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <CuratorLeaderboardSection spaceId="space-1" initialData={initialData} />
    </QueryClientProvider>
  );
}

function result(
  rows: CuratorLeaderboardResult['rows'],
  currentUserRow: CuratorLeaderboardResult['currentUserRow'] = null
) {
  return {
    period: 'week',
    metrics: { activeCurators: rows.length, rankings: 0, newsStories: 0 },
    rows,
    currentUserRow,
  } satisfies CuratorLeaderboardResult;
}

describe('CuratorLeaderboardSection', () => {
  it("links a curator's name to their space home", () => {
    renderSection(result([row()]));

    expect(screen.getByRole('link', { name: 'Ada' }).getAttribute('href')).toBe(`/space/${CURATOR_SPACE_ID}`);
  });

  it("links the viewer's own row, which renders as You", () => {
    renderSection(result([], row({ curatorSpaceId: VIEWER_SPACE_ID, name: 'Grace', isCurrentUser: true, rank: 7 })));

    expect(screen.getByRole('link', { name: 'You' }).getAttribute('href')).toBe(`/space/${VIEWER_SPACE_ID}`);
  });
});
