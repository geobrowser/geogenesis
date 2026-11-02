import { describe, expect, it } from 'vitest';

import { remoteClaimResponseFromEvent } from './remote-claim-responses';

describe('remoteClaimResponseFromEvent', () => {
  const claimResponse = {
    claim_entity_id: 'claim-1',
    profile_space_id: 'voter',
    response_kind: 'stance',
    position: true,
  };

  it('reads the claim_response geo-chat attaches to one person’s report', () => {
    expect(
      remoteClaimResponseFromEvent({
        space_id: 'space-1',
        claim_response: claimResponse,
      })
    ).toEqual({
      profileSpaceId: 'voter',
      claimId: 'claim-1',
      spaceId: 'space-1',
      responseKind: 'stance',
      position: true,
    });
  });

  it('keeps a withdrawal as null', () => {
    expect(
      remoteClaimResponseFromEvent({ space_id: 'space-1', claim_response: { ...claimResponse, position: null } })
        ?.position
    ).toBeNull();
  });

  it('is nothing for an event without one, as every other emit and an older geo-chat send', () => {
    expect(remoteClaimResponseFromEvent({ space_id: 'space-1' })).toBeNull();
  });

  it('is nothing for a malformed or unknown one', () => {
    expect(remoteClaimResponseFromEvent({ claim_response: claimResponse })).toBeNull();
    expect(
      remoteClaimResponseFromEvent({ space_id: 's', claim_response: { ...claimResponse, response_kind: 'veracity' } })
    ).toBeNull();
    expect(
      remoteClaimResponseFromEvent({ space_id: 's', claim_response: { ...claimResponse, position: 'yes' } })
    ).toBeNull();
    expect(
      remoteClaimResponseFromEvent({ space_id: 's', claim_response: { ...claimResponse, profile_space_id: 1 } })
    ).toBeNull();
  });
});
