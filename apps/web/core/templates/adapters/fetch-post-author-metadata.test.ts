import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { X_PROPERTY } from '~/core/profile/profile-links';

import { TEMPLATE_ONTOLOGY } from '../ontology';
import { fetchPostAuthorMetadata } from './use-hydrated-source-cards';

const mocks = vi.hoisted(() => ({ graph: vi.fn() }));
vi.mock('~/core/io/graphql-client', () => ({ graphql: mocks.graph }));

const POST = 'a91306fd9af647489366fe91d5c3a2f3';

type AuthorShape = {
  name?: string;
  x?: string;
  avatars?: (string | null)[];
};

function respondWith({ postUrl, author }: { postUrl?: string; author?: AuthorShape }) {
  mocks.graph.mockImplementation(({ decoder }) =>
    Effect.succeed(
      decoder({
        entities: [
          {
            id: POST,
            valuesList: postUrl ? [{ propertyId: TEMPLATE_ONTOLOGY.WEB_URL_PROPERTY_ID, text: postUrl }] : [],
            relationsList: author
              ? [
                  {
                    toEntityId: 'b82f4143c93049c558b523204448ec32',
                    toEntity: {
                      id: 'b82f4143c93049c558b523204448ec32',
                      name: author.name ?? null,
                      valuesList: author.x ? [{ propertyId: X_PROPERTY, text: author.x }] : [],
                      relationsList: (author.avatars ?? []).map(url => ({
                        toEntity: {
                          valuesList: url ? [{ propertyId: TEMPLATE_ONTOLOGY.IMAGE_URL_PROPERTY_ID, text: url }] : [],
                        },
                      })),
                    },
                  },
                ]
              : [],
          },
        ],
      })
    )
  );
}

async function metaFor(args: Parameters<typeof respondWith>[0]) {
  respondWith(args);
  return (await fetchPostAuthorMetadata([POST])).get(POST);
}

beforeEach(() => {
  mocks.graph.mockReset();
});

describe('fetchPostAuthorMetadata', () => {
  it("takes the handle from the post's own X URL before the author's X property", async () => {
    const meta = await metaFor({
      postUrl: 'https://x.com/shashj/status/1',
      author: { name: 'Shashank Joshi', x: 'someoneelse' },
    });
    expect(meta).toEqual({ name: 'Shashank Joshi', handle: '@shashj', avatarUrl: null });
  });

  it.each([
    ['shashj', '@shashj'],
    ['@shashj', '@shashj'],
    ['x.com/shashj', '@shashj'],
    ['https://twitter.com/shashj', '@shashj'],
    ['not a handle', undefined],
  ])("falls back to the author's X property %j when the post links elsewhere", async (x, handle) => {
    const meta = await metaFor({ postUrl: 'https://www.fdd.org/analysis/1', author: { name: 'FDD', x } });
    expect(meta?.handle).toBe(handle);
  });

  it.each(['https://x.com/status/123', 'https://x.com/share?url=1', 'https://x.com/i/web/status/123'])(
    'reads no handle from the app route %s',
    async postUrl => {
      const meta = await metaFor({ postUrl });
      expect(meta?.handle).toBeUndefined();
    }
  );

  it('uses the first avatar that has an image', async () => {
    const meta = await metaFor({ author: { name: 'A', avatars: [null, 'https://example.com/a.png'] } });
    expect(meta?.avatarUrl).toBe('https://example.com/a.png');
  });

  it('leaves everything out for a post with no author', async () => {
    const meta = await metaFor({});
    expect(meta).toEqual({ name: undefined, handle: undefined, avatarUrl: null });
  });
});
