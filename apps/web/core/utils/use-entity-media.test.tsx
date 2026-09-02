import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type * as React from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  /** avatar/cover relations the network returns, keyed by `entityId:propertyId`. */
  relationsByEntity: {} as Record<string, string | undefined>,
  /**
   * Entities whose requests hang until released, so a test can decide which of two in-flight
   * lookups finishes first.
   */
  gates: new Map<string, Promise<void>>(),
  /** Entities whose requests reject once released. */
  failing: new Set<string>(),
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
      const gate = mocks.gates.get(entityId);
      if (gate) await gate;

      if (mocks.failing.has(entityId)) throw new Error(`no such entity: ${entityId}`);

      const url = mocks.relationsByEntity[`${entityId}:${propertyId}`];
      return url ? [{ toEntity: { value: url } }] : [];
    },
  },
}));

const { findMediaUrlValue, useEntityMedia } = await import('./use-entity-media');
const { ContentIds } = await import('@geoprotocol/geo-sdk/lite');

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  mocks.relationsByEntity = {};
  mocks.gates = new Map();
  mocks.failing = new Set();
});

describe('findMediaUrlValue', () => {
  const WEB_URL = 'https://chat.example/debates/1/media/artifacts/final_video/content';
  const value = (propertyId: string, value: string) => ({ value, property: { id: propertyId } });

  it('reads an http(s) URL from the Web URL property', () => {
    expect(findMediaUrlValue([value('width', '1080'), value(ContentIds.WEB_URL_PROPERTY, WEB_URL)])).toBe(WEB_URL);
  });

  it('ignores http(s) values on any other property', () => {
    expect(findMediaUrlValue([value('some-source-property', 'https://example.com/article')])).toBeUndefined();
  });

  it('prefers an ipfs:// value from any property', () => {
    const values = [value(ContentIds.WEB_URL_PROPERTY, WEB_URL), value('unlabelled', 'ipfs://bafylegacy')];
    expect(findMediaUrlValue(values)).toBe('ipfs://bafylegacy');
  });
});

/** Holds every request for `entityId` until the returned function is called. */
function gate(entityId: string) {
  let release = () => {};
  mocks.gates.set(
    entityId,
    new Promise<void>(resolve => {
      release = resolve;
    })
  );
  return () => {
    mocks.gates.delete(entityId);
    release();
  };
}

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

  it('is not stranded when the previous entity’s request lands last', async () => {
    // A is still in flight when the hook moves to B, and A replies after B. Letting that late
    // reply through overwrites B's result with A's key, which reads as "nothing settled" — and
    // the effect has no reason to run again, so B waits forever.
    const releaseA = gate('entity-a');
    mocks.relationsByEntity[`entity-a:${ContentIds.AVATAR_PROPERTY}`] = 'ipfs://avatar-a';
    mocks.relationsByEntity[`entity-b:${ContentIds.AVATAR_PROPERTY}`] = 'ipfs://avatar-b';

    const { result, rerender } = renderHook(({ id }: { id: string }) => useEntityMedia(id, 'space-1'), {
      wrapper,
      initialProps: { id: 'entity-a' },
    });

    expect(result.current.isResolving).toBe(true);

    rerender({ id: 'entity-b' });
    await waitFor(() => expect(result.current.avatarUrl).toBe('ipfs://avatar-b'));

    releaseA();

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.avatarUrl).toBe('ipfs://avatar-b');
  });

  it('is not stranded when the previous entity’s request fails last', async () => {
    // Same race down the error path: an entity that doesn't exist rejects, and that rejection is
    // just as capable of clobbering the current entity's result as a successful reply.
    const releaseA = gate('entity-a');
    mocks.failing.add('entity-a');
    mocks.relationsByEntity[`entity-b:${ContentIds.AVATAR_PROPERTY}`] = 'ipfs://avatar-b';

    const { result, rerender } = renderHook(({ id }: { id: string }) => useEntityMedia(id, 'space-1'), {
      wrapper,
      initialProps: { id: 'entity-a' },
    });

    rerender({ id: 'entity-b' });
    await waitFor(() => expect(result.current.avatarUrl).toBe('ipfs://avatar-b'));

    releaseA();

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.avatarUrl).toBe('ipfs://avatar-b');
  });

  it('is never resolving without an entity to resolve', () => {
    const { result } = renderHook(() => useEntityMedia(undefined, 'space-1'), { wrapper });

    expect(result.current.isResolving).toBe(false);
  });
});
