'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import cx from 'classnames';
import Link from 'next/link';
import pluralize from 'pluralize';

import { useState } from 'react';

import { useActionsStore } from '~/core/hooks/use-actions-store';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { Close } from '~/design-system/icons/close';
import { Context } from '~/design-system/icons/context';
import { Create } from '~/design-system/icons/create';
import { Menu } from '~/design-system/menu';

import type { PostType } from '~/app/space/[id]/posts/page';

type PostsProps = {
  spaceName: string;
  spaceAvatar: string | null;
  spaceId: string;
  posts: Array<PostType>;
};

export const Posts = ({ spaceName, spaceAvatar, spaceId, posts }: PostsProps) => {
  const isEditing = useUserIsEditing(spaceId);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="text-smallTitle">
          {posts.length} {pluralize('post', posts.length)}
        </div>
        <div>
          {isEditing && (
            <Link
              href={NavUtils.toEntity(spaceId, ID.createEntityId(), SYSTEM_IDS.POST_TYPE)}
              className="stroke-grey-04 transition-colors duration-75 hover:stroke-text sm:hidden"
            >
              <Create />
            </Link>
          )}
        </div>
      </div>
      <div className="mt-5 space-y-5">
        {posts.length > 0 ? (
          <>
            {posts.map(post => (
              <Post
                key={post.id}
                spaceName={spaceName}
                spaceAvatar={spaceAvatar}
                spaceId={spaceId}
                post={post}
                isEditing={isEditing}
              />
            ))}
          </>
        ) : (
          <NewPost spaceId={spaceId} />
        )}
      </div>
    </div>
  );
};

type PostProps = {
  spaceName: string;
  spaceAvatar: string | null;
  spaceId: string;
  post: PostType;
  isEditing: boolean;
};

const Post = ({ spaceName, spaceAvatar, spaceId, post, isEditing }: PostProps) => {
  const [open, onOpenChange] = useState(false);
  const { remove } = useActionsStore();

  const handleDelete = () => {
    post.triples.forEach(triple => remove(triple));
    onOpenChange(false);
  };

  return (
    <div className="group flex w-full items-center gap-5">
      {post.avatar && (
        <Link
          href={NavUtils.toEntity(spaceId, post.id)}
          className="relative h-[80px] w-[80px] shrink-0 overflow-clip rounded-lg"
        >
          <Avatar avatarUrl={post.avatar} size={80} square />
        </Link>
      )}
      <div className="flex-grow">
        <div className="flex items-center justify-between">
          <Link href={NavUtils.toEntity(spaceId, post.id)} className="text-tableCell font-medium">
            {post.name}
          </Link>
          <div className={cx('opacity-0', isEditing && 'group-hover:opacity-100')}>
            <div>
              <Menu
                open={open}
                onOpenChange={onOpenChange}
                align="end"
                trigger={open ? <Close color="grey-04" /> : <Context color="grey-04" />}
                className="max-w-[7rem] whitespace-nowrap"
              >
                <button
                  className="w-full bg-white p-2 text-button text-grey-04 hover:bg-bg hover:text-text"
                  onClick={handleDelete}
                >
                  Delete post
                </button>
              </Menu>
            </div>
          </div>
        </div>
        <div className="text-smallButton text-text">
          <span>by </span>
          <Link href={NavUtils.toSpace(spaceId)} className="inline-flex items-center gap-1">
            {spaceAvatar && (
              <span className="relative inline-block h-[12px] w-[12px] overflow-clip rounded-sm">
                <Avatar avatarUrl={post.avatar} size={12} square />
              </span>
            )}
            <span>{spaceName}</span>
          </Link>
        </div>
        {post.description && <div className="mt-1 line-clamp-1 text-metadata text-grey-04">{post.description}</div>}
      </div>
    </div>
  );
};

type NewPostProps = {
  spaceId: string;
};

const NewPost = ({ spaceId }: NewPostProps) => {
  return (
    <Link
      href={NavUtils.toEntity(spaceId, ID.createEntityId(), SYSTEM_IDS.POST_TYPE)}
      className="bg-gradient-purple mb-8 flex items-center gap-8 overflow-clip rounded-lg p-4"
    >
      <div className="shrink-0relative relative top-1.5 -mx-4">
        <img src="/posts.png" alt="" className="-my-3 h-24 w-auto object-contain" />
      </div>
      <div>
        <div className="text-smallTitle text-text">Write and publish your first post</div>
        <div className="mt-1 text-metadata text-text">
          Let everyone on Geo know what you&rsquo;re thinking about, working on or anything else!
        </div>
      </div>
    </Link>
  );
};
