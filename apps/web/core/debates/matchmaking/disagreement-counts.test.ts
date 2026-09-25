import { describe, expect, it } from 'vitest';

import type { ParticipantPosition } from '../participant-positions';
import { groupParticipantPositions } from '../participant-positions';
import { analyzeMatchingClaims } from './disagreement-counts';

const VIEWER = '019fedae-72b6-7ab2-927a-df044d57c500';
const OTHER = '019fedae-72b6-7ab2-927a-df044d57c501';
const THIRD = '019fedae-72b6-7ab2-927a-df044d57c502';
const SECOND_SPACE = '019fedae-72b6-7ab2-927a-df044d57c601';

function position(
  profileSpaceId: string,
  claimId: string,
  side: boolean,
  spaceId = '019fedae-72b6-7ab2-927a-df044d57c600',
  responseKind: ParticipantPosition['responseKind'] = 'stance'
): ParticipantPosition {
  return { profileSpaceId, claimId, spaceId, responseKind, position: side };
}

describe('analyzeMatchingClaims', () => {
  it('counts distinct claims where comparable positions are opposite', () => {
    const positions = groupParticipantPositions([
      position(VIEWER, 'claim-1', true),
      position(OTHER, 'claim-1', false),
      // A second opposing response on the same claim must not count the claim twice. That used to
      // be a veracity response beside the stance; with one kind left, a second space is the only
      // way one pair can oppose each other twice on one claim.
      position(VIEWER, 'claim-1', true, SECOND_SPACE),
      position(OTHER, 'claim-1', false, SECOND_SPACE),
      position(VIEWER, 'claim-2', false),
      position(OTHER, 'claim-2', true),
      // A third person's count is independent.
      position(THIRD, 'claim-2', false),
    ]);

    expect(analyzeMatchingClaims(positions, VIEWER).byProfile.get(OTHER.replaceAll('-', ''))).toHaveLength(2);
  });

  /**
   * This also covered response kinds, pairing a stance against a veracity response and expecting
   * no match. Kind is still half the key (see `positionContext`), but it holds one value now, so
   * there is no second kind to pair a stance against — the case is unreachable rather than fixed.
   */
  it('does not compare positions from different spaces', () => {
    const positions = groupParticipantPositions([
      position(VIEWER, 'claim-1', true),
      position(OTHER, 'claim-1', false, SECOND_SPACE),
      position(VIEWER, 'claim-3', true),
      position(OTHER, 'claim-3', true),
    ]);

    expect(analyzeMatchingClaims(positions, VIEWER).byProfile).toEqual(new Map());
  });

  it('normalizes profile and space ids across service formats', () => {
    const space = '019fedae-72b6-7ab2-927a-df044d57c600';
    const positions = groupParticipantPositions([
      position(VIEWER.replaceAll('-', '').toUpperCase(), 'claim-1', true, space),
      position(OTHER, 'claim-1', false, space.replaceAll('-', '')),
    ]);

    expect(analyzeMatchingClaims(positions, VIEWER).byProfile.get(OTHER.replaceAll('-', ''))).toHaveLength(1);
  });

  it('returns no counts without a viewer', () => {
    const positions = groupParticipantPositions([position(VIEWER, 'claim-1', true), position(OTHER, 'claim-1', false)]);

    expect(analyzeMatchingClaims(positions, null).byProfile).toEqual(new Map());
  });

  it('keeps the claim context needed to open each disagreement', () => {
    const spaceId = '019fedae-72b6-7ab2-927a-df044d57c600';
    const positions = groupParticipantPositions([
      position(VIEWER, 'claim-1', false, spaceId),
      position(OTHER, 'claim-1', true, spaceId),
    ]);

    expect(analyzeMatchingClaims(positions, VIEWER).byProfile).toEqual(
      new Map([
        [
          OTHER.replaceAll('-', ''),
          [
            {
              claimId: 'claim-1',
              spaceId,
              responseKind: 'stance',
              viewerPosition: false,
              personPosition: true,
            },
          ],
        ],
      ])
    );
  });

  it('counts distinct matching claims within each space', () => {
    const firstSpace = '019fedae-72b6-7ab2-927a-df044d57c600';
    const secondSpace = '019fedae-72b6-7ab2-927a-df044d57c601';
    const positions = groupParticipantPositions([
      position(VIEWER, 'claim-1', true, firstSpace),
      position(OTHER, 'claim-1', false, firstSpace),
      // A repeated opposing pair in the same space still counts once. This used to be a veracity
      // response alongside the stance; with one kind left, only a duplicate row can do it.
      position(VIEWER, 'claim-1', true, firstSpace),
      position(OTHER, 'claim-1', false, firstSpace),
      // The same claim can be a match in another space too.
      position(VIEWER, 'claim-1', true, secondSpace),
      position(OTHER, 'claim-1', false, secondSpace),
      position(VIEWER, 'claim-2', false, firstSpace),
      position(OTHER, 'claim-2', true, firstSpace),
    ]);

    expect(analyzeMatchingClaims(positions, VIEWER).countsByProfileAndSpace).toEqual(
      new Map([
        [
          OTHER.replaceAll('-', ''),
          new Map([
            [firstSpace.replaceAll('-', ''), 2],
            [secondSpace.replaceAll('-', ''), 1],
          ]),
        ],
      ])
    );
  });
});
