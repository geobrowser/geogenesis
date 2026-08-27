import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiAction } from '~/core/io/rest';

import { filterGrantedMembershipRequests } from './filter-granted-membership-requests';

const graphqlMock = vi.fn();

vi.mock('~/core/environment', () => ({
  Environment: {
    getConfig: () => ({
      api: 'https://example.com/graphql',
      bundler: '',
      chainId: '19411',
      rpc: '',
    }),
  },
}));

vi.mock('./graphql', () => ({
  graphql: (...args: unknown[]) => graphqlMock(...args),
}));

const SPACE_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SPACE_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const MEMBER = '11111111111111111111111111111111';
const EDITOR = '22222222222222222222222222222222';
const OUTSIDER = '33333333333333333333333333333333';

type Roster = { members: string[]; editors: string[] };

function mockRosters(rostersBySpaceId: Record<string, Roster>) {
  graphqlMock.mockImplementation(({ query }: { query: string }) => {
    const spaceId = Object.keys(rostersBySpaceId).find(id => query.includes(`space(id: "${id}")`));
    if (!spaceId) return Effect.fail(new Error(`Unexpected roster query: ${query}`));
    const roster = rostersBySpaceId[spaceId];
    return Effect.succeed({
      space: {
        membersList: roster.members.map(memberSpaceId => ({ memberSpaceId })),
        editorsList: roster.editors.map(memberSpaceId => ({ memberSpaceId })),
      },
    });
  });
}

function proposal(spaceId: string, actionType: ApiAction['actionType'], targetId?: string) {
  return { spaceId, actions: [{ actionType, targetId }] };
}

describe('filterGrantedMembershipRequests', () => {
  beforeEach(() => {
    graphqlMock.mockReset();
  });

  it('drops ADD_MEMBER requests whose target is already a member', async () => {
    mockRosters({ [SPACE_A]: { members: [MEMBER], editors: [] } });

    const stale = proposal(SPACE_A, 'ADD_MEMBER', MEMBER);
    const fresh = proposal(SPACE_A, 'ADD_MEMBER', OUTSIDER);

    expect(await filterGrantedMembershipRequests([stale, fresh])).toEqual([fresh]);
  });

  it('drops ADD_MEMBER requests whose target is an editor but not in the members list', async () => {
    mockRosters({ [SPACE_A]: { members: [], editors: [EDITOR] } });

    expect(await filterGrantedMembershipRequests([proposal(SPACE_A, 'ADD_MEMBER', EDITOR)])).toEqual([]);
  });

  it('drops ADD_EDITOR requests whose target is already an editor, but keeps them for mere members', async () => {
    mockRosters({ [SPACE_A]: { members: [MEMBER, EDITOR], editors: [EDITOR] } });

    const stale = proposal(SPACE_A, 'ADD_EDITOR', EDITOR);
    const memberUpgrade = proposal(SPACE_A, 'ADD_EDITOR', MEMBER);

    expect(await filterGrantedMembershipRequests([stale, memberUpgrade])).toEqual([memberUpgrade]);
  });

  it('matches dashed targets against dashless roster entries', async () => {
    mockRosters({ [SPACE_A]: { members: [MEMBER], editors: [] } });

    const dashedTarget = '11111111-1111-1111-1111-111111111111';

    expect(await filterGrantedMembershipRequests([proposal(SPACE_A, 'ADD_MEMBER', dashedTarget)])).toEqual([]);
  });

  it('fails open when the roster query errors', async () => {
    graphqlMock.mockImplementation(() => Effect.fail(new Error('network down')));

    const proposals = [proposal(SPACE_A, 'ADD_MEMBER', MEMBER)];

    expect(await filterGrantedMembershipRequests(proposals)).toEqual(proposals);
  });

  it('leaves non-membership and removal proposals untouched without querying', async () => {
    const proposals = [
      proposal(SPACE_A, 'PUBLISH'),
      proposal(SPACE_A, 'REMOVE_MEMBER', MEMBER),
      proposal(SPACE_A, 'UPDATE_VOTING_SETTINGS'),
    ];

    expect(await filterGrantedMembershipRequests(proposals)).toEqual(proposals);
    expect(graphqlMock).not.toHaveBeenCalled();
  });

  it('checks each space against its own roster', async () => {
    mockRosters({
      [SPACE_A]: { members: [MEMBER], editors: [] },
      [SPACE_B]: { members: [], editors: [] },
    });

    const staleInA = proposal(SPACE_A, 'ADD_MEMBER', MEMBER);
    const freshInB = proposal(SPACE_B, 'ADD_MEMBER', MEMBER);

    expect(await filterGrantedMembershipRequests([staleInA, freshInB])).toEqual([freshInB]);
    expect(graphqlMock).toHaveBeenCalledTimes(2);
  });
});
