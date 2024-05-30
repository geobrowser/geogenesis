'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { NavUtils } from '~/core/utils/utils';

import { NoContent, NoContentOptions } from '../space-tabs/no-content';

type EmptyEntityPageProps = {
  slug: string;
  spaceId: string;
  pageTypeId: string;
};

export const EmptyEntityPage = ({ slug, spaceId, pageTypeId }: EmptyEntityPageProps) => {
  const isEditing = useUserIsEditing(spaceId);

  const options = getOptions(slug);

  return (
    <NoContent
      href={NavUtils.toEntity(spaceId, ID.createEntityId(), SYSTEM_IDS.PAGE_TYPE, [
        [SYSTEM_IDS.PAGE_TYPE_TYPE, pageTypeId],
      ])}
      options={options}
      isEditing={isEditing}
    />
  );
};

const getOptions = (slug: string) => {
  return noContentOptions[slug];
};

const POSTS_OPTIONS: NoContentOptions = {
  image: '/posts.png',
  color: 'purple',
  browse: {
    title: 'There is no posts page here yet',
    description: 'Switch to edit mode to create a posts page if you’re an editor of this space!',
  },
  edit: {
    title: 'Click here to create a posts page',
    description: '',
  },
};

const PRODUCTS_OPTIONS: NoContentOptions = {
  image: '/products.png',
  color: 'blue',
  browse: {
    title: 'There is no products page here yet',
    description: 'Switch to edit mode to create a products page if you’re an editor of this space!',
  },
  edit: {
    title: 'Click here to create a products page',
    description: '',
  },
};

const SERVICES_OPTIONS: NoContentOptions = {
  image: '/services.png',
  color: 'blue',
  browse: {
    title: 'There is no services page here yet',
    description: 'Switch to edit mode to create a services page if you’re an editor of this space!',
  },
  edit: {
    title: 'Click here to create a services page',
    description: '',
  },
};

const EVENTS_OPTIONS: NoContentOptions = {
  image: '/events.png',
  color: 'yellow',
  browse: {
    title: 'There is no events page here yet',
    description: 'Switch to edit mode to create an events page if you’re an editor of this space!',
  },
  edit: {
    title: 'Click here to create an events page',
    description: '',
  },
};

const JOBS_OPTIONS: NoContentOptions = {
  image: '/jobs.png',
  color: 'yellow',
  browse: {
    title: 'There is no jobs page here yet',
    description: 'Switch to edit mode to create a jobs page if you’re an editor of this space!',
  },
  edit: {
    title: 'Click here to create a jobs page',
    description: '',
  },
};

const PROJECTS_OPTIONS: NoContentOptions = {
  image: '/projects.png',
  color: 'blue',
  browse: {
    title: 'There is no projects page here yet',
    description: 'Switch to edit mode to create a projects page if you’re an editor of this space!',
  },
  edit: {
    title: 'Click here to create a projects page',
    description: '',
  },
};

const FINANCES_OPTIONS: NoContentOptions = {
  image: '/finances.png',
  color: 'purple',
  browse: {
    title: 'There is no finances page here yet',
    description: 'Switch to edit mode to create a finances page if you’re an editor of this space!',
  },
  edit: {
    title: 'Click here to create a finances page',
    description: '',
  },
};

const noContentOptions: Record<string, NoContentOptions> = {
  posts: POSTS_OPTIONS,
  products: PRODUCTS_OPTIONS,
  services: SERVICES_OPTIONS,
  events: EVENTS_OPTIONS,
  jobs: JOBS_OPTIONS,
  projects: PROJECTS_OPTIONS,
  finances: FINANCES_OPTIONS,
};
