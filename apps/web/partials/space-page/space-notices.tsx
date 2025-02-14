'use client';

import { SYSTEM_IDS } from '@graphprotocol/grc-20';
import { cva } from 'class-variance-authority';
import { useAtom } from 'jotai';
import type { LinkProps } from 'next/link';
import { useRouter } from 'next/navigation';

import * as React from 'react';
import { useCallback } from 'react';

import { IPFS_GATEWAY_READ_PATH, PLACEHOLDER_SPACE_IMAGE, ROOT_SPACE_ID } from '~/core/constants';
import { useAccessControl } from '~/core/hooks/use-access-control';
import { useCreateEntityFromType } from '~/core/hooks/use-create-entity-from-type';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { NavUtils, getImagePath } from '~/core/utils/utils';

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

export const SpaceNotices = ({ spaceType, spaceId }: SpaceNoticesProps) => {
  const { isEditor } = useAccessControl(spaceId);
  const isEditing = useUserIsEditing(spaceId);
  const { nextEntityId, onClick } = useCreateEntityFromType(spaceId, [SYSTEM_IDS.POST_TYPE]);

  if (spaceType === 'person') {
    if (isEditor) {
      return (
        <NoticesContainer>
          <Notice
            id="personJoinProject"
            color="purple"
            media={<img src="/project.png" alt="" className="h-24 w-auto object-contain" />}
            title={`Join or create a project you’re a team member of`}
            action={<FindProjects spaceId={spaceId} />}
          />
          <Notice
            id="personFirstPost"
            color="blue"
            media={<img src="/post.png" alt="" className="h-24 w-auto object-contain" />}
            title={`Write and publish your first post`}
            action={
              <SimpleButton onClick={onClick} href={NavUtils.toEntity(spaceId, nextEntityId)}>
                Create post
              </SimpleButton>
            }
          />
          <Notice
            id="personJoinSpaces"
            color="green"
            title={`Join spaces of interest that excite you`}
            action={<JoinSpaces />}
          />
        </NoticesContainer>
      );
    }
  }

  if (!isEditing) return null;

  switch (spaceType) {
    // case 'company':
    //   return (
    //     <NoticesContainer>
    //       <Notice
    //         id="personFillProfile"
    //         color="green"
    //         media={<img src="/showcase.png" alt="" className="h-24 w-auto object-contain" />}
    //         title={`Showcase your company to the rest of Geo`}
    //         description={`Fill out your company profile by adding events, jobs and more!`}
    //       />
    //       <Notice
    //         id="companyAddTeamMembers"
    //         color="blue"
    //         media={<img src="/team.png" alt="" className="h-24 w-auto object-contain" />}
    //         title={`Add team members to your company`}
    //         action={
    //           <div className="flex h-[38px] items-end">
    //             <SimpleButton href={`/space/${spaceId}/team`}>Add team members</SimpleButton>
    //           </div>
    //         }
    //       />
    //       <Notice
    //         id="companyFirstPost"
    //         color="purple"
    //         media={<img src="/posts.png" alt="" className="h-24 w-auto object-contain" />}
    //         title={`Write and publish your first post`}
    //         action={
    //           <div className="flex h-[38px] items-end">
    //             <SimpleButton href={NavUtils.toEntity(spaceId, nextEntityId)}>Write a post</SimpleButton>
    //           </div>
    //         }
    //       />
    //     </NoticesContainer>
    //   );
    // case 'nonprofit':
    //   return (
    //     <NoticesContainer>
    //       <Notice
    //         id="nonprofitFirstPost"
    //         color="purple"
    //         media={<img src="/posts.png" alt="" className="h-24 w-auto object-contain" />}
    //         title={`Write and publish your first post`}
    //         action={<SimpleButton href={NavUtils.toEntity(spaceId, nextEntityId)}>Write a post</SimpleButton>}
    //       />
    //       <Notice
    //         id="nonprofitFindOrAddProjects"
    //         color="blue"
    //         media={<img src="/projects.png" alt="" className="h-24 w-auto object-contain" />}
    //         title={`Find or add projects that you’re working on`}
    //         action={<SimpleButton href={`/space/${spaceId}/projects`}>Find or add projects</SimpleButton>}
    //       />
    //       <Notice
    //         id="nonprofitAddTeamMembers"
    //         color="yellow"
    //         media={<img src="/team.png" alt="" className="h-24 w-auto object-contain" />}
    //         title={`Add team members to your nonprofit`}
    //         action={<SimpleButton href={`/space/${spaceId}/team`}>Add team members</SimpleButton>}
    //       />
    //     </NoticesContainer>
    //   );
    default:
      return null;
  }
};

type NoticesContainerProps = {
  children?: React.ReactNode;
};

const NoticesContainer = ({ children }: NoticesContainerProps) => {
  return <ResizableContainer className="grid grid-cols-3 gap-5 pb-5">{children}</ResizableContainer>;
};

type NoticeProps = {
  id: string;
  color: 'grey' | 'blue' | 'green' | 'orange' | 'purple' | 'yellow';
  title: string;
  description?: string;
  action?: React.ReactNode;
  media?: React.ReactNode;
  format?: 'normal' | 'wide';
};

const noticeClassNames = cva('group relative flex rounded-lg p-4', {
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
      normal: 'col-span-1 aspect-video flex-col',
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
      <div className="relative z-10 flex h-full flex-col">
        <div className="grow text-balance text-[1.0625rem] font-medium leading-tight">{title}</div>
        {description && <div className="mt-4 shrink-0 text-metadata">{description}</div>}
        {action && <div className="mt-4 flex shrink-0 gap-2">{action}</div>}
      </div>
      {media && <div className="pointer-events-none absolute bottom-0.5 right-0 z-0 flex overflow-clip">{media}</div>}
      <div className="absolute right-0 top-0 z-10 p-3">
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
    <div className="pr-[3.25rem]">
      <SelectEntity
        placeholder=""
        onDone={result => {
          const destination = NavUtils.toEntity(ROOT_SPACE_ID, result.id);
          router.push(destination);
        }}
        spaceId={spaceId}
        allowedTypes={[SYSTEM_IDS.SPACE_TYPE, SYSTEM_IDS.PROJECT_TYPE]}
        inputClassName="!py-[3.5px]"
        variant="floating"
        width="full"
        withSearchIcon
      />
    </div>
  );
};

// type CopyPersonIdProps = {
//   personId: string;
// };

// const CopyPersonId = ({ personId }: CopyPersonIdProps) => {
//   const [hasCopiedId, setHasCopiedId] = useState(false);

//   const onCopyId = async () => {
//     try {
//       await navigator.clipboard.writeText(personId);
//       setHasCopiedId(true);
//       setTimeout(() => {
//         setHasCopiedId(false);
//       }, 3000);
//     } catch (error) {
//       console.error(error);
//     }
//   };

//   return (
//     <Button onClick={onCopyId} icon={<CustomCopy />} variant="transparent">
//       <span className={cx('absolute', !hasCopiedId && 'invisible')}>Copied!</span>
//       <span className={cx(hasCopiedId && 'invisible')}>Copy person ID</span>
//     </Button>
//   );
// };

// const CustomCopy = () => (
//   <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
//     <rect x="1.5" y="3.5" width="10" height="12" rx="1.5" stroke="#35363A" />
//     <rect x="1.5" y="3.5" width="10" height="12" rx="1.5" stroke="black" strokeOpacity="0.2" />
//     <rect x="4.5" y="0.5" width="10" height="12" rx="1.5" fill="#BDEEFF" />
//     <rect x="4.5" y="0.5" width="10" height="12" rx="1.5" stroke="#35363A" />
//     <rect x="4.5" y="0.5" width="10" height="12" rx="1.5" stroke="black" strokeOpacity="0.2" />
//   </svg>
// );

const spaces: SpaceData[] = [
  {
    id: 'BDuZwkjCg3nPWMDshoYtpS',
    name: 'Crypto news',
    image: 'bafybeie5xj53emanvi3nobzzwtetktwhvyytpbetf6sex7svnqegot7gma',
  },
  {
    id: 'DqiHGrgbniQ9RXRbcQArQ2',
    name: 'Industries',
    image: 'bafybeiafalcnab52gaxyhuyaa7sme6wo3esl46ajwr4bu6goh5tvwhdfru',
  },
  {
    id: 'Qs46y2TuFyVvgVV3QbbVW1',
    name: 'San Francisco',
    image: 'bafybeib2ctxxks7wscwjkdsov2nwkiidfbxonmptwsgcwte3u4o26ndvsu',
  },
  {
    id: 'SgjATMbm41LX6naizMqBVd',
    name: 'Crypto',
    image: 'bafkreid3fybsnf2ezqgh7aku3bzsnz2i357kqrtlv5tkudrgx5r6qmd2aa',
  },
];

const JoinSpaces = () => {
  return (
    <div className="relative -top-2 flex flex-wrap gap-2 pr-4">
      {spaces.map(space => {
        const spaceImage = space?.image
          ? getImagePath(`${IPFS_GATEWAY_READ_PATH}/${space.image}`)
          : PLACEHOLDER_SPACE_IMAGE;

        return (
          <Link
            key={space.id}
            href={NavUtils.toSpace(space.id)}
            className="inline-flex items-center gap-1.5 rounded bg-white p-1"
          >
            <span className="relative h-4 w-4 shrink-0 overflow-hidden rounded-sm">
              <img src={spaceImage} className="absolute inset-0 h-full w-full object-cover" alt="" />
            </span>
            <span className="whitespace-nowrap text-breadcrumb">{space.name}</span>
          </Link>
        );
      })}
    </div>
  );
};
