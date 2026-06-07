import type { SpaceParticipantProfile } from '~/core/space-members/use-space-participants-infinite';
import { formatShortAddress } from '~/core/utils/utils';

import type { SpaceChatParticipant, SpaceChatStatus } from './types';

const STATUS_ROTATION: SpaceChatStatus[] = ['online', 'online', 'idle', 'offline'];

function participantDisplayName(participant: SpaceChatParticipant): string {
  if (participant.name) return participant.name;
  if (participant.address.startsWith('0x')) return formatShortAddress(participant.address);
  return participant.address;
}

function profileKey(profile: Pick<SpaceParticipantProfile, 'spaceId' | 'address'>) {
  return profile.spaceId || profile.address.toLowerCase();
}

function toParticipant(
  profile: SpaceParticipantProfile,
  role: SpaceChatParticipant['role'],
  index: number
): SpaceChatParticipant {
  return {
    id: profileKey(profile),
    spaceId: profile.spaceId,
    address: profile.address,
    name: profile.name,
    avatarUrl: profile.avatarUrl,
    profileLink: profile.profileLink,
    role,
    status: STATUS_ROTATION[index % STATUS_ROTATION.length],
  };
}

export function mergeSpaceChatParticipants({
  editors,
  members,
  connectedAddress,
  canPost,
}: {
  editors: SpaceParticipantProfile[];
  members: SpaceParticipantProfile[];
  connectedAddress: string | null;
  canPost: boolean;
}): SpaceChatParticipant[] {
  const byId = new Map<string, SpaceChatParticipant>();

  editors.forEach((editor, index) => {
    byId.set(profileKey(editor), toParticipant(editor, 'editor', index));
  });

  members.forEach((member, index) => {
    const key = profileKey(member);
    const existing = byId.get(key);
    if (existing) return;
    byId.set(key, toParticipant(member, 'member', index + editors.length));
  });

  if (connectedAddress && canPost) {
    const normalized = connectedAddress.toLowerCase();
    const isPresent = [...byId.values()].some(participant => participant.address.toLowerCase() === normalized);
    if (!isPresent) {
      byId.set(`viewer:${normalized}`, {
        id: `viewer:${normalized}`,
        spaceId: `viewer:${normalized}`,
        address: connectedAddress,
        name: 'You',
        avatarUrl: null,
        profileLink: null,
        role: 'member',
        status: 'online',
      });
    }
  }

  return [...byId.values()].sort((a, b) => {
    if (a.role !== b.role) return a.role === 'editor' ? -1 : 1;
    return participantDisplayName(a).localeCompare(participantDisplayName(b));
  });
}

export function fallbackSpaceChatParticipants({
  spaceName,
  connectedAddress,
  canPost,
}: {
  spaceName: string;
  connectedAddress: string | null;
  canPost: boolean;
}): SpaceChatParticipant[] {
  const participants: SpaceChatParticipant[] = [
    {
      id: 'space-editor',
      spaceId: 'space-editor',
      address: `${spaceName} editor`,
      name: 'Space editor',
      avatarUrl: null,
      profileLink: null,
      role: 'editor',
      status: 'online',
    },
    {
      id: 'space-member',
      spaceId: 'space-member',
      address: `${spaceName} member`,
      name: 'Space member',
      avatarUrl: null,
      profileLink: null,
      role: 'member',
      status: 'idle',
    },
  ];

  if (connectedAddress && canPost) {
    participants.unshift({
      id: `viewer:${connectedAddress.toLowerCase()}`,
      spaceId: `viewer:${connectedAddress.toLowerCase()}`,
      address: connectedAddress,
      name: 'You',
      avatarUrl: null,
      profileLink: null,
      role: 'member',
      status: 'online',
    });
  }

  return participants;
}

export function resolveCurrentParticipant({
  participants,
  connectedAddress,
}: {
  participants: SpaceChatParticipant[];
  connectedAddress: string | null;
}): SpaceChatParticipant | null {
  if (!connectedAddress) return null;
  const normalized = connectedAddress.toLowerCase();
  return (
    participants.find(participant => participant.address.toLowerCase() === normalized) ?? {
      id: `viewer:${normalized}`,
      spaceId: `viewer:${normalized}`,
      address: connectedAddress,
      name: 'You',
      avatarUrl: null,
      profileLink: null,
      role: 'member',
      status: 'online',
    }
  );
}

export function formatParticipantName(participant: SpaceChatParticipant | null | undefined): string {
  if (!participant) return 'Unknown member';
  return participantDisplayName(participant);
}
