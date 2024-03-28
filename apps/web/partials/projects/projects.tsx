'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import cx from 'classnames';
import Link from 'next/link';
import pluralize from 'pluralize';

import { useState } from 'react';

import { useActionsStore } from '~/core/hooks/use-actions-store';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { Triple } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { ChevronRight } from '~/design-system/icons/chevron-right';
import { Close } from '~/design-system/icons/close';
import { Context } from '~/design-system/icons/context';
import { Create } from '~/design-system/icons/create';
import { Menu } from '~/design-system/menu';

type ProjectsProps = {
  spaceName: string;
  spaceAvatar: string | null;
  spaceId: string;
  projects: Array<ProjectType>;
};

export type ProjectType = {
  id: string;
  name: string;
  description: string;
  avatar: string | null;
  triples: Array<Triple>;
};

export const Projects = ({ spaceName, spaceAvatar, spaceId, projects }: ProjectsProps) => {
  const isEditing = useUserIsEditing(spaceId);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="text-smallTitle">
          {projects.length} {pluralize('project', projects.length)}
        </div>
        <div>
          {isEditing && (
            <Link
              href={NavUtils.toEntity(spaceId, ID.createEntityId(), SYSTEM_IDS.PROJECT_TYPE)}
              className="stroke-grey-04 transition-colors duration-75 hover:stroke-text sm:hidden"
            >
              <Create />
            </Link>
          )}
        </div>
      </div>
      <div className="mt-5 space-y-5">
        {projects.length > 0 ? (
          <>
            {projects.map(project => (
              <Project
                key={project.id}
                spaceName={spaceName}
                spaceAvatar={spaceAvatar}
                spaceId={spaceId}
                project={project}
                isEditing={isEditing}
              />
            ))}
          </>
        ) : (
          <div>temp</div>
        )}
      </div>
    </div>
  );
};

type ProjectProps = {
  spaceName: string;
  spaceAvatar: string | null;
  spaceId: string;
  project: ProjectType;
  isEditing: boolean;
};

const Project = ({ spaceName, spaceAvatar, spaceId, project, isEditing }: ProjectProps) => {
  const [open, onOpenChange] = useState(false);
  const { remove } = useActionsStore();

  const handleDelete = () => {
    project.triples.forEach(triple => remove(triple));
    onOpenChange(false);
  };

  return (
    <div className="group flex w-full items-center gap-5">
      {project.avatar && (
        <Link
          href={NavUtils.toEntity(spaceId, project.id)}
          className="relative h-[80px] w-[80px] shrink-0 overflow-clip rounded-lg"
        >
          <Avatar avatarUrl={project.avatar} size={80} square />
        </Link>
      )}
      <div className="flex-grow">
        <div className="flex items-center justify-between">
          <Link href={NavUtils.toEntity(spaceId, project.id)} className="text-tableCell font-medium">
            {project.name}
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
        <div className="inline-flex items-center gap-2 text-smallButton text-text">
          <Link href={NavUtils.toSpace(spaceId)} className="inline-flex items-center gap-1">
            {spaceAvatar && (
              <span className="relative inline-block h-[12px] w-[12px] overflow-clip rounded-sm">
                <Avatar avatarUrl={project.avatar} size={12} square />
              </span>
            )}
            <span>{spaceName}</span>
          </Link>
          <ChevronRight />
          <span className="flex h-6 items-center rounded-sm bg-divider px-1.5 text-breadcrumb text-grey-04">
            Project
          </span>
        </div>
        {project.description && (
          <div className="mt-1 line-clamp-1 text-metadata text-grey-04">{project.description}</div>
        )}
      </div>
    </div>
  );
};
