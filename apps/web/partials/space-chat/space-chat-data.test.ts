import { describe, expect, it } from 'vitest';

import type { SpaceParticipantProfile } from '~/core/space-members/use-space-participants-infinite';

import { mergeSpaceChatParticipants, normalizePersonId } from './space-chat-data';

describe('space chat participant data', () => {
  it('normalizes dashed and dashless person ids to the same key', () => {
    expect(normalizePersonId('11111111-2222-4333-8444-555555555555')).toBe(
      '11111111222243338444555555555555'
    );
  });

  it('keys participants by profile entity id while retaining profile space id', () => {
    const [participant] = mergeSpaceChatParticipants({
      editors: [profile({ id: '11111111222243338444555555555555', spaceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })],
      members: [],
      connectedAddress: null,
      canPost: false,
    });

    expect(participant?.id).toBe('11111111222243338444555555555555');
    expect(participant?.spaceId).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(participant?.profileLink).toBe('/space/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  });
});

function profile({
  id,
  spaceId,
}: {
  id: string;
  spaceId: string;
}): SpaceParticipantProfile {
  return {
    id,
    spaceId,
    name: 'Chat Author',
    avatarUrl: 'ipfs://avatar',
    address: '0x0000000000000000000000000000000000000001',
    profileLink: `/space/${spaceId}`,
  } as SpaceParticipantProfile;
}
