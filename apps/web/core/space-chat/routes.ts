/** A space's Chat tab (GEO-3422). */
export function spaceChatTabPath(spaceId: string) {
  return `/space/${spaceId}/chat`;
}

/** A channel of the Chat tab (GEO-3818); #general is the tab itself. */
export function spaceChannelPath(spaceId: string, channel: string) {
  return channel === 'general'
    ? spaceChatTabPath(spaceId)
    : `${spaceChatTabPath(spaceId)}/${encodeURIComponent(channel)}`;
}
