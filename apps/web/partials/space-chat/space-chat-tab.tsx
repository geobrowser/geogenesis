'use client';

import { useFeatureFlag } from '~/core/state/feature-flags';

import { Text } from '~/design-system/text';

import { SpaceChannels } from './space-channels';

export const CHAT_TAB_COPY = {
  off: 'Chat is not available yet.',
} as const;

/**
 * A space's Chat tab (GEO-3422): its channels (GEO-3818), readable by anyone. With geo-chat's
 * channels switched off, the list is just #general (and #editors for editors).
 */
export function SpaceChatTab({ spaceId }: { spaceId: string }) {
  const enabled = useFeatureFlag('spaceChat');
  if (!enabled) {
    return (
      <Text as="p" variant="metadata" color="grey-04">
        {CHAT_TAB_COPY.off}
      </Text>
    );
  }
  return <SpaceChannels spaceId={spaceId} />;
}
