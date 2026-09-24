import * as Effect from 'effect/Effect';
import { print } from 'graphql';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import { COMMENT_REPLY_TO_ID, COMMENT_TYPE_ID } from '~/core/comment-ids';

import { graphql } from './graphql-client';
import { getCommentEntitiesViaReplyRelations } from './queries';

vi.mock('./graphql-client', () => ({
  graphql: vi.fn(),
}));

const graphqlMock = graphql as unknown as Mock;

const COMMENT_ONE_ID = '00000000000000000000000000000001';
const COMMENT_TWO_ID = '00000000000000000000000000000002';
const SPACE_ID = '00000000000000000000000000000003';

function commentNode(id: string) {
  return {
    id,
    name: `Comment ${id}`,
    description: null,
    spaceIds: [SPACE_ID],
    types: [],
    valuesList: [],
    relationsList: [],
    createdAt: '2026-09-24T12:00:00.000Z',
    updatedAt: '2026-09-24T12:00:00.000Z',
  };
}

describe('getCommentEntitiesViaReplyRelations', () => {
  beforeEach(() => {
    graphqlMock.mockReset();
  });

  it('walks connection cursors, hydrates nodes inline, and deduplicates page boundaries', async () => {
    graphqlMock.mockImplementation(({ decoder, variables }) => {
      const firstPage = variables.after == null;
      return Effect.succeed(
        decoder({
          entitiesConnection: {
            totalCount: 2,
            pageInfo: firstPage
              ? { hasNextPage: true, endCursor: 'cursor-1' }
              : { hasNextPage: false, endCursor: 'cursor-2' },
            nodes: firstPage
              ? [commentNode(COMMENT_ONE_ID)]
              : [commentNode(COMMENT_ONE_ID), commentNode(COMMENT_TWO_ID)],
          },
        })
      );
    });

    const comments = await Effect.runPromise(getCommentEntitiesViaReplyRelations('target-entity'));

    expect(comments.map(comment => comment.id)).toEqual([COMMENT_ONE_ID, COMMENT_TWO_ID]);
    expect(graphqlMock).toHaveBeenCalledTimes(2);
    expect(graphqlMock.mock.calls.map(call => call[0].variables.after)).toEqual([undefined, 'cursor-1']);
    expect(graphqlMock.mock.calls[0]?.[0]?.variables).toEqual({
      targetEntityId: 'target-entity',
      replyToTypeId: COMMENT_REPLY_TO_ID,
      commentTypeId: COMMENT_TYPE_ID,
      first: 1000,
      after: undefined,
    });

    const source = print(graphqlMock.mock.calls[0]?.[0]?.query);
    expect(source).toContain('entitiesConnection');
    expect(source).toContain('orderBy: [CREATED_AT_DESC, ID_ASC]');
    expect(source).toContain('relations: {some: {typeId: {is: $replyToTypeId}, toEntityId: {is: $targetEntityId}}}');
    expect(source).not.toContain('backlinksList');
  });
});
