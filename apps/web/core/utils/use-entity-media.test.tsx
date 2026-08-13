import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type * as React from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  /** avatar/cover relations the network returns, keyed by entity id. */
  relationsByEntity: {} as Record<string, string | undefined>,
}));

vi.mock('~/core/sync/use-store', () => ({
  useRelation: () => null,
  useValues: () => [],
}));

vi.mock('~/core/io/queries', () => ({
  getRelationsByFromEntityId: (entityId: string, propertyId: string) => ({
    entityId,
    propertyId,
  }),
}));

vi.mock('effect', () => ({
  Effect: {
    runPromise: async ({ entityId, propertyId }: { entityId: string; propertyId: string }) => {
      const url = mocks.relationsByEntity[`${entityId}:${propertyId}`];
      return url ? [{ toEntity: { value: url } }] : [];
    },
  },
}));

const { useEntityMedia } = await import('./use-entity-media');
const { ContentIds } = await import('@geoprotocol/geo-sdk/lite');

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  mocks.relationsByEntity = {};
});

describe('useEntityMedia', () => {
  it('resolves an entity’s avatar', async () => {
    mocks.relationsByEntity[`entity-a:${ContentIds.AVATAR_PROPERTY}`] = 'ipfs://avatar-a';

    const { result } = renderHook(() => useEntityMedia('entity-a', 'space-1'), { wrapper });

    await waitFor(() => expect(result.current.avatarUrl).toBe('ipfs://avatar-a'));
    expect(result.current.isResolving).toBe(false);
  });

  it('stops resolving once the lookup settles with nothing', async () => {
    const { result } = renderHook(() => useEntityMedia('entity-a', 'space-1'), { wrapper });

    expect(result.current.isResolving).toBe(true);
    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.avatarUrl).toBeUndefined();
  });

  it('does not carry one entity’s image over to the next', async () => {
    // Entity B has no image of its own. Exposing A's leaves it on screen permanently: a URL is
    // present, so `isResolving` reads false and nothing ever corrects it.
    mocks.relationsByEntity[`entity-a:${ContentIds.AVATAR_PROPERTY}`] = 'ipfs://avatar-a';

    const { result, rerender } = renderHook(({ id }: { id: string }) => useEntityMedia(id, 'space-1'), {
      wrapper,
      initialProps: { id: 'entity-a' },
    });

    await waitFor(() => expect(result.current.avatarUrl).toBe('ipfs://avatar-a'));

    rerender({ id: 'entity-b' });

    expect(result.current.avatarUrl).toBeUndefined();
    expect(result.current.isResolving).toBe(true);

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.avatarUrl).toBeUndefined();
  });

  it('re-resolves when the space changes', async () => {
    mocks.relationsByEntity[`entity-a:${ContentIds.AVATAR_PROPERTY}`] = 'ipfs://avatar-a';

    const { result, rerender } = renderHook(({ space }: { space: string }) => useEntityMedia('entity-a', space), {
      wrapper,
      initialProps: { space: 'space-1' },
    });

    await waitFor(() => expect(result.current.avatarUrl).toBe('ipfs://avatar-a'));

    rerender({ space: 'space-2' });

    expect(result.current.isResolving).toBe(true);
  });

  it('is never resolving without an entity to resolve', () => {
    const { result } = renderHook(() => useEntityMedia(undefined, 'space-1'), { wrapper });

    expect(result.current.isResolving).toBe(false);
  });
});
