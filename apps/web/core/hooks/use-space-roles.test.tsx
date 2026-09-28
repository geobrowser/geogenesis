import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSpaceRoles } from './use-space-editor-ids';

const SPACE = 'd4bee092-8fb5-405b-aba3-b1513f085835';
const AUTHOR_A = '4cd9cca5-530b-6905-6aea-d853c8088e7e';
const AUTHOR_A_HEX = '4cd9cca5530b69056aead853c8088e7e';
const AUTHOR_B = 'cc0bf85a-27c2-17d7-5993-bc785a15b198';

const getSpaceRolesForParticipants = vi.fn();

vi.mock('~/core/io/queries', () => ({
  getSpaceRolesForParticipants: (spaceId: string, ids: string[]) => getSpaceRolesForParticipants(spaceId, ids),
  getIsMemberOfSpace: vi.fn(),
  getIsEditorOfSpace: vi.fn(),
}));

let client: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  getSpaceRolesForParticipants.mockReset();
  getSpaceRolesForParticipants.mockReturnValue(Effect.succeed({ editorSpaceIds: [AUTHOR_A_HEX], memberSpaceIds: [] }));
});

describe('useSpaceRoles', () => {
  it('reports the roles it was asked about', async () => {
    const { result } = renderHook(() => useSpaceRoles(SPACE, [AUTHOR_A]), { wrapper });

    await waitFor(() => expect(result.current.editorSpaceIds).toEqual(new Set([AUTHOR_A_HEX])));
    expect(result.current.isLoading).toBe(false);
  });

  /**
   * The query key holds the people being asked about, so publishing a comment mints a new one. Without a
   * placeholder that flips `isLoading` back to true, and the caller treats loading as a hold — so every
   * badge in the thread blanks and returns on the ordinary act of commenting, which is the very flicker
   * that hold exists to prevent.
   */
  it('keeps the roles it already knows when a new author joins the thread', async () => {
    const { result, rerender } = renderHook((props: { ids: string[] }) => useSpaceRoles(SPACE, props.ids), {
      wrapper,
      initialProps: { ids: [AUTHOR_A] },
    });

    await waitFor(() => expect(result.current.editorSpaceIds).toEqual(new Set([AUTHOR_A_HEX])));

    // A comment is published; its author joins the set the thread asks about.
    rerender({ ids: [AUTHOR_A, AUTHOR_B] });

    // A's badge does not blink out while B is being asked about.
    expect(result.current.isLoading).toBe(false);
    expect(result.current.editorSpaceIds).toEqual(new Set([AUTHOR_A_HEX]));
  });

  it('reports a failure rather than folding it into empty roles', async () => {
    getSpaceRolesForParticipants.mockReturnValue(Effect.fail(new Error('boom')));

    const { result } = renderHook(() => useSpaceRoles(SPACE, [AUTHOR_A]), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.editorSpaceIds.size).toBe(0);
  });
});
