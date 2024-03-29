import { POST_TYPE } from '@geogenesis/ids/system-ids';

import { Subgraph } from '~/core/io';
import { Triple } from '~/core/types';
import { Entity } from '~/core/utils/entity';

import { Posts } from '~/partials/posts/posts';

type PostsPageProps = {
  params: { id: string; entityId: string };
};

export default async function PostsPage({ params }: PostsPageProps) {
  const spaceId = params.id;
  const space = await Subgraph.fetchSpace({ id: spaceId });
  const entity = space?.spaceConfig;

  if (!space || !entity) return null;

  const spaceName = entity.name ?? '';
  const spaceAvatar = Entity.avatar(entity.triples);

  const posts = await getPosts(spaceId);

  return <Posts spaceName={spaceName} spaceAvatar={spaceAvatar} spaceId={spaceId} posts={posts} />;
}

export type PostType = {
  id: string;
  name: string;
  description: string;
  avatar: string | null;
  triples: Array<Triple>;
};

const getPosts = async (spaceId: string) => {
  const posts: Array<PostType> = [];

  const postEntities = await Subgraph.fetchEntities({
    spaceId,
    typeIds: [POST_TYPE],
    filter: [],
  });

  postEntities.forEach(post => {
    posts.push({
      id: post.id,
      name: post.name ?? '',
      description: post.description ?? '',
      avatar: Entity.avatar(post.triples),
      triples: post.triples,
    });
  });

  return posts;
};
