import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type React from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClaimCommentPositionBadge, ClaimCommentPositionProvider } from './claim-comment-position';

const mocks = vi.hoisted(() => ({
  getEntityResponders: vi.fn(),
}));

vi.mock('~/core/io/queries', () => ({
  getEntityResponders: mocks.getEntityResponders,
}));

function wrapper(client: QueryClient, children: React.ReactNode) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('claim comment position badges', () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mocks.getEntityResponders.mockReset();
  });

  afterEach(() => {
    cleanup();
    client.clear();
  });

  it('shows the indexed claim position beside a commenter', async () => {
    mocks.getEntityResponders.mockReturnValue(
      Effect.succeed([{ userId: 'author-space', direction: 'negative' as const }])
    );

    render(
      wrapper(
        client,
        <ClaimCommentPositionProvider
          entityId="claim-1"
          spaceId="space-1"
          responseKind="stance"
          viewerDirection={null}
          viewerSpaceId={null}
        >
          <ClaimCommentPositionBadge authorSpaceId="author-space" />
        </ClaimCommentPositionProvider>
      )
    );

    expect(await screen.findByText('Disagree')).toBeInTheDocument();
  });

  it('uses the viewer’s optimistic position and the claim’s factual vocabulary', async () => {
    mocks.getEntityResponders.mockReturnValue(
      Effect.succeed([{ userId: 'viewer-space', direction: 'negative' as const }])
    );

    render(
      wrapper(
        client,
        <ClaimCommentPositionProvider
          entityId="claim-1"
          spaceId="space-1"
          responseKind="veracity"
          viewerDirection="positive"
          viewerSpaceId="viewer-space"
        >
          <ClaimCommentPositionBadge authorSpaceId="viewer-space" />
        </ClaimCommentPositionProvider>
      )
    );

    expect(await screen.findByText('Verify')).toBeInTheDocument();
    expect(screen.queryByText('Dispute')).not.toBeInTheDocument();
  });
});
