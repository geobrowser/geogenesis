'use client';

import { IdUtils, SystemIds } from '@graphprotocol/grc-20';
import { cva } from 'class-variance-authority';
import cx from 'classnames';
import dayjs from 'dayjs';
import { useAtom } from 'jotai';
import type { LinkProps } from 'next/link';
import { useRouter } from 'next/navigation';

import * as React from 'react';
import { useCallback, useState } from 'react';

import { IPFS_GATEWAY_READ_PATH, PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useAccessControl } from '~/core/hooks/use-access-control';
import { useCreateEntityWithFilters } from '~/core/hooks/use-create-entity-with-filters';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useEditorInstance } from '~/core/state/editor/editor-provider';
import { useTabId } from '~/core/state/editor/use-editor';
import { useName } from '~/core/state/entity-page-store/entity-store';
import { useMutate } from '~/core/sync/use-mutate';
import { NavUtils, getImagePath } from '~/core/utils/utils';
import { getTabSlug } from '~/core/utils/utils';

import { SmallButton } from '~/design-system/button';
import { ClientOnly } from '~/design-system/client-only';
import { CloseSmall } from '~/design-system/icons/close-small';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { ResizableContainer } from '~/design-system/resizable-container';
import { SelectEntity } from '~/design-system/select-entity';

import { SpacePageType } from '~/app/space/[id]/page';
import { dismissedNoticesAtom } from '~/atoms';
import { teamNoticeDismissedAtom } from '~/atoms';
import type { RepeatingNotice } from '~/atoms';

const AUTHORS_PROPERTY = '91a9e2f6-e51a-48f7-9976-61de8561b690';

type SpaceNoticesProps = {
  spaceType: SpacePageType;
  spaceId: string;
  entityId: string;
};

export const SpaceNotices = ({ spaceType, spaceId, entityId }: SpaceNoticesProps) => {
  const { isEditor } = useAccessControl(spaceId);
  const isEditing = useUserIsEditing(spaceId);
  const { nextEntityId, onClick } = useCreateEntityWithFilters(spaceId);
  const authorName = useName(entityId, spaceId);
  const teamTabId = useTeamTabId();
  const currentTabId = useTabId();

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
              <SimpleButton
                onClick={() =>
                  onClick({
                    filters: [
                      {
                        columnId: SystemIds.TYPES_PROPERTY,
                        columnName: 'Types',
                        value: SystemIds.POST_TYPE,
                        valueName: 'Post',
                        valueType: 'RELATION',
                      },
                      {
                        columnId: AUTHORS_PROPERTY,
                        columnName: 'Authors',
                        value: entityId,
                        valueName: authorName,
                        valueType: 'RELATION',
                      },
                    ],
                  })
                }
                href={NavUtils.toEntity(spaceId, nextEntityId, true)}
              >
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
    case 'company': {
      if (currentTabId && teamTabId && currentTabId === teamTabId) {
        return (
          <NoticesContainer>
            <TeamNotice />
          </NoticesContainer>
        );
      }

      return (
        <NoticesContainer>
          <Notice
            id="copmanyFillProfile"
            color="purple"
            title={`Fill out your profile to showcase it to the rest of The Graph`}
            action={
              <div className="-mx-3">
                <img src="/showcase.png" alt="" className="relative -top-0.5 w-full object-cover" />
              </div>
            }
          />
          <Notice
            id="companyAddTeamMembers"
            color="blue"
            media={<img src="/team.png" alt="" className="h-20 w-auto object-contain" />}
            title={`Add team members to your company`}
            action={
              <div className="flex h-[38px] items-end">
                <SimpleButton href={teamTabId ? `/space/${spaceId}?tabId=${teamTabId}` : `/space/${spaceId}/team`}>
                  Add team
                </SimpleButton>
              </div>
            }
          />
          <Notice
            id="companyFirstPost"
            color="green"
            media={<img src="/post.png" alt="" className="h-24 w-auto object-contain" />}
            title={`Write and publish your first post`}
            action={
              <div className="flex h-[38px] items-end">
                <SimpleButton
                  onClick={() =>
                    onClick({
                      filters: [
                        {
                          columnId: SystemIds.TYPES_PROPERTY,
                          columnName: 'Types',
                          value: SystemIds.POST_TYPE,
                          valueName: 'Post',
                          valueType: 'RELATION',
                        },
                        {
                          columnId: AUTHORS_PROPERTY,
                          columnName: 'Authors',
                          value: entityId,
                          valueName: authorName,
                          valueType: 'RELATION',
                        },
                      ],
                    })
                  }
                  href={NavUtils.toEntity(spaceId, nextEntityId, true)}
                >
                  Create post
                </SimpleButton>
              </div>
            }
          />
        </NoticesContainer>
      );
    }
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

const noticeClassNames = cva('group relative flex overflow-clip rounded-lg p-4', {
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
        <div className="grow text-balance pr-8 text-[1.0625rem] font-medium leading-tight">{title}</div>
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
  const { storage } = useMutate();

  return (
    <div className="pr-[3.25rem]">
      <SelectEntity
        placeholder=""
        onDone={(result, fromCreateFn) => {
          const destinationSpace = fromCreateFn ? spaceId : result.primarySpace || spaceId;
          const destination = NavUtils.toEntity(destinationSpace, result.id);
          router.push(destination);
        }}
        onCreateEntity={result => {
          storage.entities.name.set(result.id, spaceId, result.name || '');

          storage.relations.set({
            id: IdUtils.generate(),
            entityId: IdUtils.generate(),
            spaceId,
            renderableType: 'RELATION',
            fromEntity: {
              id: result.id,
              name: result.name,
            },
            toEntity: {
              id: SystemIds.PROJECT_TYPE,
              name: 'Project',
              value: SystemIds.PROJECT_TYPE,
            },
            type: {
              id: SystemIds.TYPES_PROPERTY,
              name: 'Types',
            },
          });
        }}
        spaceId={spaceId}
        relationValueTypes={projectValueTypes}
        inputClassName="!py-[3.5px]"
        variant="floating"
        width="full"
        withSearchIcon
      />
    </div>
  );
};

const projectValueTypes = [
  {
    id: SystemIds.SPACE_TYPE,
    name: 'Space',
  },
  {
    id: SystemIds.PROJECT_TYPE,
    name: 'Project',
  },
];

// @TODO(migration): Correct space ids
const spaces = [
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

const useTeamTabId = () => {
  const { initialTabs } = useEditorInstance();

  if (!initialTabs) return null;

  const teamTab = Object.entries(initialTabs).find(([, tab]) => {
    const tabSlug = getTabSlug(tab.entity.name ?? '');
    return tabSlug === 'team';
  });

  const teamTabId = teamTab?.[0];

  return teamTabId ?? null;
};

const TeamNotice = () => {
  const [dismissed, setDismissed] = useAtom(teamNoticeDismissedAtom);
  const showNotice = getShowNotice(dismissed);

  const handleTemporarilyDismiss = useCallback(() => {
    setDismissed({
      dismissedCount: dismissed.dismissedCount + 1,
      lastDismissed: dayjs().format('YYYY-MM-DD'),
    });
  }, [dismissed, setDismissed]);

  const [dismissedNotices, setDismissedNotices] = useAtom(dismissedNoticesAtom);

  const handlePermanentlyDismiss = useCallback(() => {
    const newDismissedNotices = [...dismissedNotices, 'companyTeamSetup'];
    setDismissedNotices(newDismissedNotices);
  }, [dismissedNotices, setDismissedNotices]);

  if (dismissedNotices.includes('companyTeamSetup') || !showNotice) return null;

  return (
    <ClientOnly>
      <div className="col-span-3 overflow-clip rounded-lg border border-grey-02">
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-purple flex aspect-[3/2] w-[3.75rem] shrink-0 items-center justify-center rounded p-2">
              <img src="/invite-your-team-to-create-a-geo-account.png" alt="" className="h-full w-auto" />
            </div>
            <div className="flex w-full items-center justify-between">
              <div className="text-metadataMedium text-text">1 — Invite your team to create a Geo account</div>
              <div>
                <CopyInviteLink />
              </div>
            </div>
          </div>
          <hr className="h-px w-full border-none bg-grey-02" />
          <div className="flex items-center gap-4">
            <div className="bg-gradient-blue flex aspect-[3/2] w-[3.75rem] shrink-0 items-center justify-center rounded p-2">
              <img src="/ask-for-their-person-id.png" alt="" className="h-full w-auto" />
            </div>
            <div className="flex w-full items-center">
              <div className="text-metadataMedium text-text">2 — Ask for their person ID</div>
            </div>
          </div>
          <hr className="h-px w-full border-none bg-grey-02" />
          <div className="flex items-start gap-4">
            <div className="bg-gradient-green flex aspect-[3/2] w-[3.75rem] shrink-0 items-center justify-center rounded p-2">
              <img src="/link-or-add-team-members.png" alt="" className="h-auto w-full" />
            </div>
            <div>
              <div className="text-metadataMedium text-text">3 — Link or add team members</div>
              <div className="text-metadata text-grey-04">
                Link team members by searching the name field with their person ID, and verify their personal spaces as
                being legitimate. You can also add team members who haven’t joined and link them later!
              </div>
            </div>
          </div>
        </div>
        <div className="itesm-center flex justify-between border-t border-grey-02 bg-bg px-4 py-2">
          <div>
            <button onClick={handlePermanentlyDismiss} className="text-resultLink text-ctaHover">
              Dismiss forever
            </button>
          </div>
          <div>
            <button onClick={handleTemporarilyDismiss} className="text-resultLink text-ctaHover">
              Remind me later
            </button>
          </div>
        </div>
      </div>
    </ClientOnly>
  );
};

const CopyInviteLink = () => {
  const [hasCopiedId, setHasCopiedId] = useState(false);

  const onCopyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(`https://geobrowser.com/root`);
      setHasCopiedId(true);
      setTimeout(() => {
        setHasCopiedId(false);
      }, 3000);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <SmallButton onClick={onCopyInviteLink}>
      <span className={cx('absolute', !hasCopiedId && 'invisible')}>Copied!</span>
      <span className={cx(hasCopiedId && 'invisible')}>Copy invite link</span>
    </SmallButton>
  );
};

const getShowNotice = (dismissed: RepeatingNotice) => {
  switch (dismissed.dismissedCount) {
    case undefined:
      return true;
    case -1:
      return false;
    case 0:
      return true;
    case 1:
      return dayjs().diff(dismissed.lastDismissed, 'day') >= 1;
    case 2:
      return dayjs().diff(dismissed.lastDismissed, 'day') >= 3;
    default:
      return dayjs().diff(dismissed.lastDismissed, 'day') >= 7;
  }
};
