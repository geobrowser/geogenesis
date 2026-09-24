import { describe, expect, it } from 'vitest';

import type { ParticipantPosition } from '../participant-positions';
import { groupParticipantPositions } from '../participant-positions';
import {
  disagreementCountsByProfile,
  disagreementCountsByProfileAndSpace,
  disagreementsByProfile,
} from './disagreement-counts';

const VIEWER = '019fedae-72b6-7ab2-927a-df044d57c500';
const OTHER = '019fedae-72b6-7ab2-927a-df044d57c501';
const THIRD = '019fedae-72b6-7ab2-927a-df044d57c502';

function position(
  profileSpaceId: string,
  claimId: string,
  side: boolean,
  spaceId = '019fedae-72b6-7ab2-927a-df044d57c600',
  responseKind: ParticipantPosition['responseKind'] = 'stance'
): ParticipantPosition {
  return { profileSpaceId, claimId, spaceId, responseKind, position: side };
}

describe('disagreementCountsByProfile', () => {
  it('counts distinct claims where comparable positions are opposite', () => {
    const positions = groupParticipantPositions([
      position(VIEWER, 'claim-1', true),
      position(OTHER, 'claim-1', false),
      // A second opposing response on the same claim must not count the claim twice.
      position(VIEWER, 'claim-1', true, undefined, 'veracity'),
      position(OTHER, 'claim-1', false, undefined, 'veracity'),
      position(VIEWER, 'claim-2', false),
      position(OTHER, 'claim-2', true),
      // A third person's count is independent.
      position(THIRD, 'claim-2', false),
    ]);

    expect(disagreementCountsByProfile(positions, VIEWER)).toEqual(new Map([[OTHER.replaceAll('-', ''), 2]]));
  });

  it('does not compare positions from different spaces or response kinds', () => {
    const otherSpace = '019fedae-72b6-7ab2-927a-df044d57c601';
    const positions = groupParticipantPositions([
      position(VIEWER, 'claim-1', true),
      position(OTHER, 'claim-1', false, otherSpace),
      position(VIEWER, 'claim-2', true, undefined, 'stance'),
      position(OTHER, 'claim-2', false, undefined, 'veracity'),
      position(VIEWER, 'claim-3', true),
      position(OTHER, 'claim-3', true),
    ]);

    expect(disagreementCountsByProfile(positions, VIEWER)).toEqual(new Map());
  });

  it('normalizes profile and space ids across service formats', () => {
    const space = '019fedae-72b6-7ab2-927a-df044d57c600';
    const positions = groupParticipantPositions([
      position(VIEWER.replaceAll('-', '').toUpperCase(), 'claim-1', true, space),
      position(OTHER, 'claim-1', false, space.replaceAll('-', '')),
    ]);

    expect(disagreementCountsByProfile(positions, VIEWER)).toEqual(new Map([[OTHER.replaceAll('-', ''), 1]]));
  });

  it('returns no counts without a viewer', () => {
    const positions = groupParticipantPositions([position(VIEWER, 'claim-1', true), position(OTHER, 'claim-1', false)]);

    expect(disagreementCountsByProfile(positions, null)).toEqual(new Map());
  });

  it('keeps the claim context needed to open each disagreement', () => {
    const spaceId = '019fedae-72b6-7ab2-927a-df044d57c600';
    const positions = groupParticipantPositions([
      position(VIEWER, 'claim-1', false, spaceId, 'veracity'),
      position(OTHER, 'claim-1', true, spaceId, 'veracity'),
    ]);

    expect(disagreementsByProfile(positions, VIEWER)).toEqual(
      new Map([
        [
          OTHER.replaceAll('-', ''),
          [
            {
              claimId: 'claim-1',
              spaceId,
              responseKind: 'veracity',
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
      // Another opposing axis on the same claim and space still counts once.
      position(VIEWER, 'claim-1', true, firstSpace, 'veracity'),
      position(OTHER, 'claim-1', false, firstSpace, 'veracity'),
      // The same claim can be a match in another space too.
      position(VIEWER, 'claim-1', true, secondSpace),
      position(OTHER, 'claim-1', false, secondSpace),
      position(VIEWER, 'claim-2', false, firstSpace),
      position(OTHER, 'claim-2', true, firstSpace),
    ]);

    expect(disagreementCountsByProfileAndSpace(positions, VIEWER)).toEqual(
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
