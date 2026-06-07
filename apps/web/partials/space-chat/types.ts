export type SpaceChatRole = 'editor' | 'member';

export type SpaceChatStatus = 'online' | 'idle' | 'offline';

export type SpaceChatParticipant = {
  id: string;
  spaceId: string;
  address: string;
  name: string | null;
  avatarUrl: string | null;
  profileLink: string | null;
  role: SpaceChatRole;
  status: SpaceChatStatus;
};

export type SpaceChatChannel = {
  id: string;
  name: string;
  description: string;
  unreadCount?: number;
};

export type SpaceChatReaction = {
  emoji: string;
  count: number;
  reacted?: boolean;
};

export type SpaceChatMessage = {
  id: string;
  channelId: string;
  authorId: string;
  author?: SpaceChatParticipant;
  body: string;
  createdAt: string;
  editedAt?: string | null;
  reactions?: SpaceChatReaction[];
  pending?: boolean;
};

export type SpaceChatMessagesByChannel = Record<string, SpaceChatMessage[]>;
