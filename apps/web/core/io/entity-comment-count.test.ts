import * as Effect from 'effect/Effect';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import { COMMENT_REPLY_TO_ID, COMMENT_TYPE_ID } from '~/core/comment-ids';

import { graphql } from './graphql-client';
import { getEntityCommentCount } from './queries';

vi.mock('./graphql-client', () => ({
  graphql: vi.fn(),
}));

const graphqlMock = graphql as unknown as Mock;

describe('getEntityCommentCount', () => {
  beforeEach(() => {
    graphqlMock.mockReset();
  });

  it('counts only distinct comment entities returned by the filtered Reply to backlink query', async () => {
    graphqlMock.mockImplementation(({ decoder, variables }) => {
      const ids = variables.offset === 0 ? ['comment-1', 'comment-1', 'comment-2'] : [];
      return Effect.succeed(
        decoder({
          entity: {
            backlinksList: ids.map(id => ({ fromEntity: { id } })),
          },
        })
      );
    });

    const count = await Effect.runPromise(getEntityCommentCount('target-entity'));

    expect(count).toBe(2);
    expect(graphqlMock).toHaveBeenCalledOnce();
    expect(graphqlMock.mock.calls[0]?.[0]?.variables).toMatchObject({
      id: 'target-entity',
      replyToTypeId: COMMENT_REPLY_TO_ID,
      commentTypeId: COMMENT_TYPE_ID,
      first: 1000,
      offset: 0,
    });
  });

  it('paginates counts beyond the backlink page size and deduplicates across pages', async () => {
    const firstPageIds = Array.from({ length: 1000 }, (_, index) => `comment-${index}`);

    graphqlMock.mockImplementation(({ decoder, variables }) => {
      const ids = variables.offset === 0 ? firstPageIds : ['comment-999', 'comment-1000'];
      return Effect.succeed(
        decoder({
          entity: {
            backlinksList: ids.map(id => ({ fromEntity: { id } })),
          },
        })
      );
    });

    const count = await Effect.runPromise(getEntityCommentCount('target-entity'));

    expect(count).toBe(1001);
    expect(graphqlMock).toHaveBeenCalledTimes(2);
    expect(graphqlMock.mock.calls.map(call => call[0].variables.offset)).toEqual([0, 1000]);
  });
});
