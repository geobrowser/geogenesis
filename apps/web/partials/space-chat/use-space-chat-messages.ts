'use client';

import * as React from 'react';

import type { SpaceChatMessage } from './types';

type UseSpaceChatMessagesArgs = {
  spaceId: string;
  channelId: string;
};

export function useSpaceChatMessages({ spaceId, channelId }: UseSpaceChatMessagesArgs) {
  // Adapter boundary for the upcoming chat service. Intentionally no network
  // calls here until that service API is ready.
  const messages = React.useMemo<SpaceChatMessage[]>(() => [], [spaceId, channelId]);

  const sendMessage = React.useCallback(async (body: string) => {
    void body;
    return null;
  }, []);

  return {
    messages,
    isAvailable: false,
    isLoading: false,
    isPosting: false,
    error: null as Error | null,
    postError: null as Error | null,
    sendMessage,
  };
}
