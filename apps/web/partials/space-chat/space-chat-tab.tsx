'use client';

import { useSpaceChatRooms } from '~/core/space-chat/hooks';
import { useFeatureFlag } from '~/core/state/feature-flags';

import { Text } from '~/design-system/text';

import { SpaceChannels } from './space-channels';
import { SpaceChatPanel } from './space-chat-panel';

export const CHAT_TAB_COPY = {
  off: 'Chat is not available yet.',
} as const;

/** A space's Chat tab (GEO-3422): the member room, readable by anyone, or its channels (GEO-3818). */
export function SpaceChatTab({ spaceId }: { spaceId: string }) {
  const enabled = useFeatureFlag('spaceChat');
  const channelsFlag = useFeatureFlag('spaceChannels');
  // Channels need the flag and geo-chat's switch; otherwise the tab is #general alone, as before.
  const rooms = useSpaceChatRooms(spaceId, enabled && channelsFlag);
  const channels = channelsFlag && rooms.data?.channelsEnabled === true;
  if (!enabled) {
    return (
      <Text as="p" variant="metadata" color="grey-04">
        {CHAT_TAB_COPY.off}
      </Text>
    );
  }
  if (channels) return <SpaceChannels spaceId={spaceId} />;
  if (channelsFlag && rooms.isPending) return <div className="h-[min(70dvh,720px)] min-h-80" />;
  return (
    <div className="flex h-[min(70dvh,720px)] min-h-80 flex-col rounded-lg border border-grey-02 bg-white">
      <SpaceChatPanel spaceId={spaceId} className="min-h-0 flex-1" />
    </div>
  );
}
