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

  it('reads the exact total from the filtered Comment entities connection', async () => {
    graphqlMock.mockImplementation(({ decoder }) =>
      Effect.succeed(decoder({ entitiesConnection: { totalCount: 1001 } }))
    );

    const count = await Effect.runPromise(getEntityCommentCount('target-entity'));

    expect(count).toBe(1001);
    expect(graphqlMock).toHaveBeenCalledOnce();
    expect(graphqlMock.mock.calls[0]?.[0]?.variables).toMatchObject({
      targetEntityId: 'target-entity',
      replyToTypeId: COMMENT_REPLY_TO_ID,
      commentTypeId: COMMENT_TYPE_ID,
    });
  });

  it('returns zero when the connection is absent', async () => {
    graphqlMock.mockImplementation(({ decoder }) => Effect.succeed(decoder({ entitiesConnection: null })));

    const count = await Effect.runPromise(getEntityCommentCount('target-entity'));

    expect(count).toBe(0);
  });
});
