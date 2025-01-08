'use client';

import { SYSTEM_IDS } from '@geogenesis/sdk';
import { cva } from 'class-variance-authority';
import cx from 'classnames';
import { useAtom } from 'jotai';
import type { LinkProps } from 'next/link';
import { useRouter } from 'next/navigation';

import * as React from 'react';
import { useCallback } from 'react';
import { useState } from 'react';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useAccessControl } from '~/core/hooks/use-access-control';
import { useCreateEntityFromType } from '~/core/hooks/use-create-entity-from-type';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { NavUtils, getImagePath } from '~/core/utils/utils';

import { Button } from '~/design-system/button';
import { CloseSmall } from '~/design-system/icons/close-small';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { ResizableContainer } from '~/design-system/resizable-container';
import { SelectEntity } from '~/design-system/select-entity';

import { SpacePageType } from '~/app/space/[id]/page';
import type { SpaceData } from '~/app/space/[id]/spaces/page';
import { dismissedNoticesAtom } from '~/atoms';

type SpaceNoticesProps = {
  spaceType: SpacePageType;
  spaceId: string;
  entityId: string;
};

export const SpaceNotices = ({ spaceType, spaceId, entityId }: SpaceNoticesProps) => {
  const { isEditor } = useAccessControl(spaceId);
  const isEditing = useUserIsEditing(spaceId);
  const { nextEntityId, onClick } = useCreateEntityFromType(spaceId, [SYSTEM_IDS.POST_TYPE]);

  if (spaceType === 'person') {
    if (isEditor) {
      return (
        <NoticesContainer>
          <Notice
            id="personJoinProject"
            color="blue"
            media={<img src="/project.png" alt="" className="h-24 w-auto object-contain" />}
            title={`Make sure you’re part of at least one project`}
            description={`If your project already exists on Geo send your person ID to an editor in that space to link your profile and request to join as a member. If it doesn’t exist, create it!`}
            action={
              <div className="flex w-full gap-6">
                <div className="w-full flex-grow">
                  <FindProjects spaceId={spaceId} />
                </div>
                <div className="flex-shrink-0">
                  <CopyPersonId personId={entityId} />
                </div>
              </div>
            }
            format="wide"
          />
          <Notice
            id="personFillProfile"
            color="green"
            media={<img src="/showcase.png" alt="" className="h-24 w-auto object-contain" />}
            title={`Showcase your work, goals and favorite things`}
            description={`Filled profiles are more likely to be accepted as a space members`}
          />
          <Notice
            id="personJoinSpaces"
            color="orange"
            media={
              <div className="-mr-16 pl-4 pt-2">
                <JoinSpaces />
              </div>
            }
            title={`Join spaces of interest as a member or editor`}
            action={
              <div className="flex h-[38px] items-end">
                <SimpleButton href={`/spaces`}>View all spaces</SimpleButton>
              </div>
            }
          />
          <Notice
            id="personFirstPost"
            color="purple"
            media={<img src="/post.png" alt="" className="h-24 w-auto object-contain" />}
            title={`Write and publish your first post`}
            action={
              <div className="flex h-[38px] items-end">
                <SimpleButton onClick={onClick} href={NavUtils.toEntity(spaceId, nextEntityId)}>
                  Write a post
                </SimpleButton>
              </div>
            }
          />
        </NoticesContainer>
      );
    }
  }

  if (!isEditing) return null;

  switch (spaceType) {
    case 'company':
      return (
        <NoticesContainer>
          <Notice
            id="personFillProfile"
            color="green"
            media={<img src="/showcase.png" alt="" className="h-24 w-auto object-contain" />}
            title={`Showcase your company to the rest of Geo`}
            description={`Fill out your company profile by adding events, jobs and more!`}
          />
          <Notice
            id="companyAddTeamMembers"
            color="blue"
            media={<img src="/team.png" alt="" className="h-24 w-auto object-contain" />}
            title={`Add team members to your company`}
            action={
              <div className="flex h-[38px] items-end">
                <SimpleButton href={`/space/${spaceId}/team`}>Add team members</SimpleButton>
              </div>
            }
          />
          <Notice
            id="companyFirstPost"
            color="purple"
            media={<img src="/posts.png" alt="" className="h-24 w-auto object-contain" />}
            title={`Write and publish your first post`}
            action={
              <div className="flex h-[38px] items-end">
                <SimpleButton href={NavUtils.toEntity(spaceId, nextEntityId)}>Write a post</SimpleButton>
              </div>
            }
          />
        </NoticesContainer>
      );
    case 'nonprofit':
      return (
        <NoticesContainer>
          <Notice
            id="nonprofitFirstPost"
            color="purple"
            media={<img src="/posts.png" alt="" className="h-24 w-auto object-contain" />}
            title={`Write and publish your first post`}
            action={<SimpleButton href={NavUtils.toEntity(spaceId, nextEntityId)}>Write a post</SimpleButton>}
          />
          <Notice
            id="nonprofitFindOrAddProjects"
            color="blue"
            media={<img src="/projects.png" alt="" className="h-24 w-auto object-contain" />}
            title={`Find or add projects that you’re working on`}
            action={<SimpleButton href={`/space/${spaceId}/projects`}>Find or add projects</SimpleButton>}
          />
          <Notice
            id="nonprofitAddTeamMembers"
            color="yellow"
            media={<img src="/team.png" alt="" className="h-24 w-auto object-contain" />}
            title={`Add team members to your nonprofit`}
            action={<SimpleButton href={`/space/${spaceId}/team`}>Add team members</SimpleButton>}
          />
        </NoticesContainer>
      );
    default:
      return null;
  }
};

type NoticesContainerProps = {
  children?: React.ReactNode;
};

const NoticesContainer = ({ children }: NoticesContainerProps) => {
  return <ResizableContainer className="grid grid-cols-3 gap-8 pb-4">{children}</ResizableContainer>;
};

type NoticeProps = {
  id: string;
  color: 'grey' | 'blue' | 'green' | 'orange' | 'purple' | 'yellow';
  media?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  format?: 'normal' | 'wide';
};

const noticeClassNames = cva('group relative flex w-full justify-between rounded-lg p-4', {
  variants: {
    color: {
      purple: 'bg-gradient-purple',
      blue: 'bg-gradient-blue',
      yellow: 'bg-gradient-yellow',
      grey: 'bg-gradient-grey',
      green: 'bg-gradient-green',
      orange: 'bg-gradient-orange',
    },
    format: {
      normal: 'col-span-1 aspect-square flex-col',
      wide: 'col-span-3 flex-row gap-6 pr-10',
    },
  },
});

const Notice = ({ id, color, media, title, description, action, format = 'normal' }: NoticeProps) => {
  const [dismissedNotices, setDismissedNotices] = useAtom(dismissedNoticesAtom);

  const handleDismissNotice = useCallback(() => {
    const newDismissedNotices = [...dismissedNotices, id];
    setDismissedNotices(newDismissedNotices);
  }, [id, dismissedNotices, setDismissedNotices]);

  if (dismissedNotices.includes(id)) return null;

  return (
    <div id={id} className={noticeClassNames({ color, format })}>
      <div className="relative -top-1.5 -mx-4 flex-shrink-0">{media}</div>
      <div>
        <div className="text-balance text-smallTitle">{title}</div>
        {description && <div className="mt-4 text-metadata">{description}</div>}
        {action && <div className="mt-4 flex gap-2">{action}</div>}
      </div>
      <div className="absolute right-0 top-0 p-3">
        <button
          onClick={handleDismissNotice}
          className="p-1 opacity-50 transition duration-300 ease-in-out hover:opacity-100"
        >
          <CloseSmall />
        </button>
      </div>
    </div>
  );
};

type SimpleButtonProps = LinkProps & { children: React.ReactNode };

const SimpleButton = ({ href = '', ...rest }: SimpleButtonProps) => {
  return <Link href={href} className="rounded border border-text px-2 py-1 text-smallButton text-text" {...rest} />;
};

type FindProjectsProps = {
  spaceId: string;
};

const FindProjects = ({ spaceId }: FindProjectsProps) => {
  const router = useRouter();

  return (
    <div>
      <SelectEntity
        placeholder="Search projects..."
        onDone={result => {
          const destination = NavUtils.toEntity(SYSTEM_IDS.ROOT_SPACE_ID, result.id);
          router.push(destination);
        }}
        spaceId={spaceId}
        allowedTypes={[
          { typeName: 'Space', typeId: SYSTEM_IDS.SPACE_TYPE, spaceIdOfAttribute: SYSTEM_IDS.ROOT_SPACE_ID },
          { typeName: 'Project', typeId: SYSTEM_IDS.PROJECT_TYPE, spaceIdOfAttribute: SYSTEM_IDS.ROOT_SPACE_ID },
        ]}
        inputClassName="!py-[3.5px]"
        variant="floating"
        width="full"
        withSearchIcon
      />
    </div>
  );
};

type CopyPersonIdProps = {
  personId: string;
};

const CopyPersonId = ({ personId }: CopyPersonIdProps) => {
  const [hasCopiedId, setHasCopiedId] = useState(false);

  const onCopyId = async () => {
    try {
      await navigator.clipboard.writeText(personId);
      setHasCopiedId(true);
      setTimeout(() => {
        setHasCopiedId(false);
      }, 3000);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <Button onClick={onCopyId} icon={<CustomCopy />} variant="transparent">
      <span className={cx('absolute', !hasCopiedId && 'invisible')}>Copied!</span>
      <span className={cx(hasCopiedId && 'invisible')}>Copy person ID</span>
    </Button>
  );
};

const CustomCopy = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1.5" y="3.5" width="10" height="12" rx="1.5" stroke="#35363A" />
    <rect x="1.5" y="3.5" width="10" height="12" rx="1.5" stroke="black" strokeOpacity="0.2" />
    <rect x="4.5" y="0.5" width="10" height="12" rx="1.5" fill="#BDEEFF" />
    <rect x="4.5" y="0.5" width="10" height="12" rx="1.5" stroke="#35363A" />
    <rect x="4.5" y="0.5" width="10" height="12" rx="1.5" stroke="black" strokeOpacity="0.2" />
  </svg>
);

const spaces: SpaceData[] = [
  { id: `1`, name: `Crypto`, image: `ipfs://QmZ3DG2sJJ97tg81QXhmpNuJhfu7wPMbSY8PbQq8HjDrHi` },
  { id: `2`, name: `US Politics`, image: `ipfs://Qmapijr8TKb5wKa9y9iBtqt1rTvjq5LQd238y9XbPo46W8` },
  { id: `3`, name: `Social Work`, image: `ipfs://QmdFGfsfspuCdubtJjnTfEcTsNr47voySUXTi3Pf8VW8uw` },
  { id: `4`, name: `Philosophy`, image: `ipfs://Qme1VbiszsjLAUcFzDbnikWCpNB6HpDEzMENmhEeYpLvfX` },
  { id: `5`, name: `San Francisco`, image: `ipfs://QmPusCwgMnhTFiXstYthTGSWr7nnC5Vab3V8xTcK4h1hbV` },
  { id: `6`, name: `Travel`, image: `ipfs://QmdQEwqswMLHYBjphH3guHpZYCm4NqfXqkcM5j4CBpMu8w` },
];

const JoinSpaces = () => {
  return (
    <div className="flex flex-wrap gap-2 pr-16">
      {spaces.map(space => {
        const spaceImage = space?.image ? getImagePath(space.image) : PLACEHOLDER_SPACE_IMAGE;

        return (
          <Link
            key={space.id}
            href={NavUtils.toSpace(space.id)}
            className="inline-flex items-center gap-1.5 rounded bg-white p-1 text-breadcrumb"
          >
            <span className="relative h-3 w-3 overflow-hidden rounded-sm">
              <img src={spaceImage} className="absolute inset-0 h-full w-full object-cover object-center" alt="" />
            </span>
            <span>{space.name}</span>
          </Link>
        );
      })}
    </div>
  );
};
