import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type React from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_IS_FACTUAL_PROPERTY_ID, CLAIM_TYPE_ID } from '~/core/claims/ontology';

import {
  ClaimCommentPositionBadge,
  ClaimCommentPositionBoundary,
  ClaimCommentPositionProvider,
} from './claim-comment-position';

const mocks = vi.hoisted(() => ({
  getEntityResponders: vi.fn(),
  entity: null as null | Record<string, unknown>,
  summary: {
    viewerDirection: null as 'positive' | 'negative' | null,
    viewerSpaceId: null as string | null,
    isViewerResponseLoading: false,
  },
  summaryArgs: null as unknown[] | null,
}));

vi.mock('~/core/io/queries', () => ({
  getEntityResponders: mocks.getEntityResponders,
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntity: () => ({ entity: mocks.entity, isLoading: false }),
}));

vi.mock('./claim-response-summary', () => ({
  CLAIM_RESPONSE_OBJECT_TYPE: 0,
  useClaimResponseSummary: (...args: unknown[]) => {
    mocks.summaryArgs = args;
    return mocks.summary;
  },
}));

function wrapper(client: QueryClient, children: React.ReactNode) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('claim comment position badges', () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mocks.getEntityResponders.mockReset();
    mocks.entity = null;
    mocks.summary = { viewerDirection: null, viewerSpaceId: null, isViewerResponseLoading: false };
    mocks.summaryArgs = null;
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
          isViewerResponseLoading={false}
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
          responseKind="stance"
          viewerDirection="positive"
          viewerSpaceId="viewer-space"
          isViewerResponseLoading
        >
          <ClaimCommentPositionBadge authorSpaceId="viewer-space" />
        </ClaimCommentPositionProvider>
      )
    );

    expect(await screen.findByText('Agree')).toBeInTheDocument();
    expect(screen.queryByText('Disagree')).not.toBeInTheDocument();
  });

  it('preserves the indexed viewer position while their own response query is unresolved', async () => {
    mocks.getEntityResponders.mockReturnValue(
      Effect.succeed([{ userId: 'viewer-space', direction: 'negative' as const }])
    );

    render(
      wrapper(
        client,
        <ClaimCommentPositionProvider
          entityId="claim-1"
          spaceId="space-1"
          responseKind="stance"
          viewerDirection={null}
          viewerSpaceId="viewer-space"
          isViewerResponseLoading
        >
          <ClaimCommentPositionBadge authorSpaceId="viewer-space" />
        </ClaimCommentPositionProvider>
      )
    );

    expect(await screen.findByText('Disagree')).toBeInTheDocument();
  });

  it('removes the indexed viewer position after their response resolves as cleared', async () => {
    mocks.getEntityResponders.mockReturnValue(
      Effect.succeed([{ userId: 'viewer-space', direction: 'negative' as const }])
    );

    render(
      wrapper(
        client,
        <ClaimCommentPositionProvider
          entityId="claim-1"
          spaceId="space-1"
          responseKind="stance"
          viewerDirection={null}
          viewerSpaceId="viewer-space"
          isViewerResponseLoading={false}
        >
          <span data-testid="claim-comment-position-empty">
            <ClaimCommentPositionBadge authorSpaceId="viewer-space" />
          </span>
        </ClaimCommentPositionProvider>
      )
    );

    expect(await screen.findByTestId('claim-comment-position-empty')).toBeEmptyDOMElement();
  });

  it('supplies claim position context to a generic comments surface', async () => {
    mocks.entity = {
      relations: [
        {
          isDeleted: false,
          type: { id: SystemIds.TYPES_PROPERTY },
          toEntity: { id: CLAIM_TYPE_ID },
        },
      ],
      values: [
        {
          isDeleted: false,
          property: { id: CLAIM_IS_FACTUAL_PROPERTY_ID },
          spaceId: 'space-1',
          value: '1',
        },
      ],
    };
    mocks.summary = {
      viewerDirection: 'positive',
      viewerSpaceId: 'viewer-space',
      isViewerResponseLoading: true,
    };
    mocks.getEntityResponders.mockReturnValue(
      Effect.succeed([{ userId: 'author-space', direction: 'negative' as const }])
    );

    render(
      wrapper(
        client,
        <ClaimCommentPositionBoundary entityId="claim-1" spaceId="space-1">
          <ClaimCommentPositionBadge authorSpaceId="author-space" />
        </ClaimCommentPositionBoundary>
      )
    );

    expect(await screen.findByText('Disagree')).toBeInTheDocument();
    expect(mocks.summaryArgs).toEqual(['claim-1', 'space-1', 'stance', true]);
  });
});
