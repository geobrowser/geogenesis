'use client';

import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';

import { useRouter } from 'next/navigation';

import { ID } from '~/core/id';

import { hideDebate, unhideDebate } from './api';
import { forgetOwnRemoval, rememberOwnRemoval } from './debate-removal';
import { useGeoChatAuth } from './hooks';

/**
 * Every cached read a removal or restore changes: the space listings the debate sits in, its by-id
 * read (under either spelling of its id — the entity page anchors on the hex id, geo-chat answers
 * with the hyphenated one), and the Explore feed that leads with playable debates.
 */
export function invalidateAfterVisibilityChange(queryClient: QueryClient, debateId: string) {
  return queryClient.invalidateQueries({
    predicate: query => {
      const [root, kind, id] = query.queryKey;
      if (root === 'debates') {
        if (kind === 'space') return true;
        return (kind === 'detail' || kind === 'media') && typeof id === 'string' && ID.equals(id, debateId);
      }
      return root === '/api/explore/feed';
    },
  });
}

/**
 * Removes a debate through geo-chat, then refreshes the feed, the listings, and the server-rendered
 * entity page — which asks geo-chat itself (`fetchDebateVisibility`) and so needs a fresh render to
 * swap the debate for its removed state.
 */
export function useRemoveDebate(debateId: string) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (reason: string | null) => hideDebate(debateId, reason, getPrivyIdentityToken, accountKey),
    onSuccess: async response => {
      rememberOwnRemoval(debateId, response.hidden_by_user_id);
      await invalidateAfterVisibilityChange(queryClient, debateId);
      router.refresh();
    },
  });
}

export function useRestoreDebate(debateId: string) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: () => unhideDebate(debateId, getPrivyIdentityToken, accountKey),
    onSuccess: async () => {
      forgetOwnRemoval(debateId);
      await invalidateAfterVisibilityChange(queryClient, debateId);
      router.refresh();
    },
  });
}
