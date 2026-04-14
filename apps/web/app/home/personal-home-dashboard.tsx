'use client';

import * as React from 'react';

import { cva } from 'class-variance-authority';
import { motion } from 'framer-motion';
import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

import { SidebarCounts } from '~/core/io/fetch-sidebar-counts';

import { SmallButton } from '~/design-system/button';
import { CheckCircleSmall } from '~/design-system/icons/check-circle-small';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Close } from '~/design-system/icons/close';
import { EditSmall } from '~/design-system/icons/edit-small';
import { InProgressSmall } from '~/design-system/icons/in-progress-small';
import { CheckCloseSmall } from '~/design-system/icons/check-close-small';
import { GeoImage } from '~/design-system/geo-image';
import { Member } from '~/design-system/icons/member';
import { Menu } from '~/design-system/menu';
import { useSearchParams } from 'next/navigation';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { tabGroupTabLinkStyles } from '~/design-system/tab-group';
import { Text } from '~/design-system/text';

import {
  type GovernanceHomeReviewCategory,
  type GovernanceHomeStatusFilter,
} from './fetch-active-proposals-in-editor-spaces';

type GovernanceFilters = {
  spaceId: string;
  category: GovernanceHomeReviewCategory;
  status: GovernanceHomeStatusFilter;
};

function buildHomeHref(parts: {
  tab: 'review' | 'my';
  space: string;
  category: GovernanceHomeReviewCategory;
  status: GovernanceHomeStatusFilter;
}) {
  const params = new URLSearchParams();
  if (parts.tab === 'my') params.set('tab', 'my');
  if (parts.space !== 'all') params.set('space', parts.space);
  if (parts.category !== 'all') params.set('proposalCategory', parts.category);
  if (parts.status !== 'pending') params.set('proposalStatus', parts.status);
  const q = params.toString();
  return q ? `/home?${q}` : '/home';
}

const categoryLabels: Record<GovernanceHomeReviewCategory, string> = {
  all: 'All proposals',
  knowledge: 'Knowledge',
  membership: 'Membership',
  settings: 'Settings',
};

const statusLabels: Record<GovernanceHomeStatusFilter, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
};

type PersonalHomeDashboardProps = {
  sidebarCounts?: SidebarCounts;
  proposalsList: React.ReactNode;
  governanceTab: 'review' | 'my';
  governanceFilters: GovernanceFilters;
  editorSpaceOptions: { id: string; name: string; image: string | null }[];
  myProposalSpaceOptions: { id: string; name: string; image: string | null }[];
};

function GovernanceTabsRow({
  governanceTab,
  filterState,
}: {
  governanceTab: 'review' | 'my';
  filterState: { space: string; category: GovernanceHomeReviewCategory; status: GovernanceHomeStatusFilter };
}) {
  const searchParams = useSearchParams();
  const hrefForTab = (target: 'review' | 'my') => {
    const next = new URLSearchParams(searchParams?.toString() ?? '');
    if (target === 'review') next.delete('tab');
    else next.set('tab', 'my');
    next.delete('proposalType');
    next.delete('space');
    next.delete('proposalCategory');
    next.delete('proposalStatus');
    if (filterState.space !== 'all') next.set('space', filterState.space);
    if (filterState.category !== 'all') next.set('proposalCategory', filterState.category);
    if (filterState.status !== 'pending') next.set('proposalStatus', filterState.status);
    const q = next.toString();
    return q ? `/home?${q}` : '/home';
  };

  return (
    <div className="relative mt-8 w-full">
      <div className="relative z-0">
        <div className="relative flex w-max items-center gap-6 pb-2">
          <Link
            href={hrefForTab('review')}
            prefetch
            className={tabGroupTabLinkStyles({ active: governanceTab === 'review' })}
          >
            Review proposals
            {governanceTab === 'review' ? (
              <motion.div
                layoutId="governance-home-tab-active-border"
                layout
                initial={false}
                transition={{ duration: 0.2 }}
                className="absolute right-0 bottom-[-8px] left-0 z-100 h-px bg-text"
              />
            ) : null}
          </Link>
          <Link
            href={hrefForTab('my')}
            prefetch
            className={tabGroupTabLinkStyles({ active: governanceTab === 'my' })}
          >
            My proposals
            {governanceTab === 'my' ? (
              <motion.div
                layoutId="governance-home-tab-active-border"
                layout
                initial={false}
                transition={{ duration: 0.2 }}
                className="absolute right-0 bottom-[-8px] left-0 z-100 h-px bg-text"
              />
            ) : null}
          </Link>
        </div>
        <div className="absolute right-0 bottom-0 left-0 z-0 h-px bg-grey-02" />
      </div>
    </div>
  );
}

export function PersonalHomeDashboard({
  sidebarCounts,
  proposalsList,
  governanceTab,
  governanceFilters,
  editorSpaceOptions,
  myProposalSpaceOptions,
}: PersonalHomeDashboardProps) {
  const spaceOptions = governanceTab === 'review' ? editorSpaceOptions : myProposalSpaceOptions;

  const spaceLabel =
    governanceFilters.spaceId === 'all'
      ? 'All spaces'
      : spaceOptions.find(s => s.id === governanceFilters.spaceId)?.name ?? 'All spaces';

  const categoryLabel = categoryLabels[governanceFilters.category];
  const statusLabel = statusLabels[governanceFilters.status];

  const filterState = {
    space: governanceFilters.spaceId,
    category: governanceFilters.category,
    status: governanceFilters.status,
  };

  return (
    <>
      <React.Suspense fallback={<div className="mt-8 h-8" />}>
        <GovernanceTabsRow governanceTab={governanceTab} filterState={filterState} />
      </React.Suspense>
      <div className="mt-4 flex flex-wrap gap-2">
        <GovernanceFilterMenu
          label={spaceLabel}
          showImages
          maxHeightClass="max-h-[25rem] overflow-y-auto"
          items={[
            {
              label: 'All spaces',
              href: buildHomeHref({ tab: governanceTab, ...filterState, space: 'all' }),
              showImage: false,
            },
            ...spaceOptions.map(s => ({
              label: s.name,
              image: s.image,
              showImage: true,
              href: buildHomeHref({ tab: governanceTab, ...filterState, space: s.id }),
            })),
          ]}
        />
        <GovernanceFilterMenu
          label={categoryLabel}
          items={(Object.keys(categoryLabels) as GovernanceHomeReviewCategory[]).map(key => ({
            label: categoryLabels[key],
            href: buildHomeHref({ tab: governanceTab, ...filterState, category: key }),
          }))}
        />
        <GovernanceFilterMenu
          label={statusLabel}
          items={(Object.keys(statusLabels) as GovernanceHomeStatusFilter[]).map(key => ({
            label: statusLabels[key],
            href: buildHomeHref({ tab: governanceTab, ...filterState, status: key }),
          }))}
        />
      </div>
      <div className="mt-4 flex gap-8">
        <div className="w-2/3">
          <Notices />
          {proposalsList}
        </div>
        <div className="w-1/3">
          <Sidebar counts={sidebarCounts} />
        </div>
      </div>
    </>
  );
}

function GovernanceFilterMenu({
  label,
  items,
  showImages,
  maxHeightClass,
}: {
  label: string;
  items: { label: string; href: string; image?: string | null; showImage?: boolean }[];
  showImages?: boolean;
  maxHeightClass?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      asChild
      trigger={<SmallButton icon={<ChevronDownSmall />}>{label}</SmallButton>}
      align="start"
    >
      <div className={maxHeightClass}>
        {items.map(item => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className="flex w-full cursor-pointer items-center gap-2 bg-white px-3 py-2.5 hover:bg-bg"
          >
            {showImages && item.showImage !== false ? (
              item.image ? (
                <span className="relative h-5 w-5 shrink-0 overflow-hidden rounded-md">
                  <GeoImage value={item.image} alt="" fill sizes="20px" style={{ objectFit: 'cover' }} />
                </span>
              ) : (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-grey-01 text-[10px] font-medium text-grey-04">
                  {(item.label.trim().slice(0, 1).toUpperCase() || '?').replace(/[^A-Z0-9?]/g, '?')}
                </span>
              )
            ) : null}
            <Text variant="button" className="hover:text-text!">
              {item.label}
            </Text>
          </Link>
        ))}
      </div>
    </Menu>
  );
}

const Notices = () => {
  return (
    <div className="mb-2 space-y-2">
      <Notice
        id="welcomeToGovernanceHome"
        color="grey"
        title="Welcome to your governance home"
        description="Your area to see any proposals, member requests, and editor requests across the spaces you are involved in."
        media={
          <div className="relative h-[118px] w-[128px] shrink-0 overflow-hidden sm:h-[124px] sm:w-[136px]" aria-hidden>
            <img
              src="/home.png"
              alt=""
              className="pointer-events-none block h-full w-full min-h-0 min-w-0 select-none object-cover object-left object-top"
            />
          </div>
        }
      />
    </div>
  );
};

type NoticeProps = {
  id: string;
  color: 'grey' | 'blue' | 'green' | 'orange' | 'purple';
  title: string;
  description: string;
  element?: React.ReactNode;
  media?: React.ReactNode;
};

const dismissedNoticesAtom = atomWithStorage<Array<string>>('dismissedNotices', []);

const Notice = ({ id, color, title, description, element, media }: NoticeProps) => {
  const [dismissedNotices, setDismissedNotices] = useAtom(dismissedNoticesAtom);

  const classNames = cva('relative flex gap-4 overflow-clip rounded-lg px-4 pt-4', {
    variants: {
      color: {
        grey: 'bg-gradient-grey',
        blue: 'bg-gradient-blue',
        green: 'bg-gradient-green',
        orange: 'bg-gradient-orange',
        purple: 'bg-gradient-purple',
      },
    },
  });

  const handleDismissNotice = React.useCallback(() => {
    setDismissedNotices([...dismissedNotices, id]);
  }, [id, dismissedNotices, setDismissedNotices]);

  if (dismissedNotices.includes(id)) return null;

  return (
    <div id={id} className={`${classNames({ color })} ${media ? 'pb-6' : 'pb-4'}`}>
      <div className="min-w-0 flex-1">
        <div className="text-smallTitle">{title}</div>
        <div className="mt-2">{description}</div>
        {element && <div className="mt-2">{element}</div>}
      </div>
      {media && <div className="flex shrink-0 items-end leading-none">{media}</div>}
      <div className="shrink-0">
        <button type="button" onClick={handleDismissNotice} className="rounded border p-1">
          <Close />
        </button>
      </div>
    </div>
  );
};

type SidebarProps = {
  counts?: SidebarCounts;
};

const Sidebar = ({ counts }: SidebarProps) => {
  return (
    <div className="space-y-2">
      <Activity
        label="My proposals"
        activities={[
          { icon: <InProgressSmall />, label: 'Pending', count: counts?.myProposals.inProgress ?? 0 },
          { icon: <CheckCircleSmall />, label: 'Accepted', count: counts?.myProposals.accepted ?? 0 },
          { icon: <CheckCloseSmall />, label: 'Rejected', count: counts?.myProposals.rejected ?? 0 },
        ]}
      />
      <Activity
        label="Proposals I've voted on"
        activities={[
          { icon: <CheckCircleSmall />, label: 'Accepted', count: counts?.votedOn.accepted ?? 0 },
          { icon: <CheckCloseSmall />, label: 'Rejected', count: counts?.votedOn.rejected ?? 0 },
        ]}
      />
      <Activity
        label="I have accepted"
        activities={[
          { icon: <Member />, label: 'Members', count: counts?.iHaveAccepted.members ?? 0 },
          { icon: <EditSmall />, label: 'Editors', count: counts?.iHaveAccepted.editors ?? 0 },
        ]}
      />
    </div>
  );
};

type ActivityProps = {
  label: string;
  activities: { icon?: React.ReactNode; label: string; count: number }[];
};

function Activity({ label = '', activities = [] }: ActivityProps) {
  return (
    <div className="rounded-lg border border-grey-02 p-4">
      <div className="text-breadcrumb text-grey-04">{label}</div>
      {activities.map(({ icon, label: rowLabel, count }) => (
        <div key={rowLabel} className="mt-2 flex items-center justify-between text-metadataMedium">
          <div className="inline-flex items-center gap-2">
            {icon && <div>{icon}</div>}
            <div>{rowLabel}</div>
          </div>
          <div>{count}</div>
        </div>
      ))}
    </div>
  );
}
