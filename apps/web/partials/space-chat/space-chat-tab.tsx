'use client';

import { useFeatureFlag } from '~/core/state/feature-flags';

import { Text } from '~/design-system/text';

import { SpaceChatPanel } from './space-chat-panel';

export const CHAT_TAB_COPY = {
  off: 'Chat is not available yet.',
} as const;

/** A space's Chat tab (GEO-3422): the member room, readable by anyone. */
export function SpaceChatTab({ spaceId }: { spaceId: string }) {
  const enabled = useFeatureFlag('spaceChat');
  if (!enabled) {
    return (
      <Text as="p" variant="metadata" color="grey-04">
        {CHAT_TAB_COPY.off}
      </Text>
    );
  }
  return (
    <div className="flex h-[min(70dvh,720px)] min-h-80 flex-col rounded-lg border border-grey-02 bg-white">
      <SpaceChatPanel spaceId={spaceId} className="min-h-0 flex-1" />
    </div>
  );
}
