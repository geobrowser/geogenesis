'use client';

import * as React from 'react';

import { cva } from 'class-variance-authority';
import cx from 'classnames';
import { motion } from 'framer-motion';
import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { useRouter } from 'next/navigation';

import { SmallButton } from '~/design-system/button';
import { ThumbGeoImage } from '~/design-system/geo-image';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Close } from '~/design-system/icons/close';
import { Menu } from '~/design-system/menu';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { tabGroupTabLinkStyles } from '~/design-system/tab-group';
import { Text } from '~/design-system/text';

import {
  type GovernanceHomeReviewCategory,
  type GovernanceHomeStatusFilter,
} from './fetch-active-proposals-in-editor-spaces';
import { useGovernanceHomeChrome } from './governance-home-chrome-context';

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
  children: React.ReactNode;
  governanceTab: 'review' | 'my';
  governanceFilters: GovernanceFilters;
};

function GovernanceTabsRow({
  governanceTab,
  filterState,
}: {
  governanceTab: 'review' | 'my';
  filterState: { space: string; category: GovernanceHomeReviewCategory; status: GovernanceHomeStatusFilter };
}) {
  const hrefForTab = (target: 'review' | 'my') =>
    buildHomeHref({
      tab: target,
      space: filterState.space,
      category: filterState.category,
      status: filterState.status,
    });

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
          <Link href={hrefForTab('my')} prefetch className={tabGroupTabLinkStyles({ active: governanceTab === 'my' })}>
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

export function PersonalHomeDashboard({ children, governanceTab, governanceFilters }: PersonalHomeDashboardProps) {
  const { editorSpaceOptions, myProposalSpaceOptions, sidebar } = useGovernanceHomeChrome();

  const spaceOptions = governanceTab === 'review' ? editorSpaceOptions : myProposalSpaceOptions;

  const spaceLabel =
    governanceFilters.spaceId === 'all'
      ? 'All spaces'
      : (spaceOptions.find(s => s.id === governanceFilters.spaceId)?.name ?? 'All spaces');

  const categoryLabel = categoryLabels[governanceFilters.category];
  const statusLabel = statusLabels[governanceFilters.status];

  const filterState = {
    space: governanceFilters.spaceId,
    category: governanceFilters.category,
    status: governanceFilters.status,
  };

  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const navigate = React.useCallback(
    (href: string) => {
      startTransition(() => router.push(href));
    },
    [router]
  );

  return (
    <>
      <GovernanceTabsRow governanceTab={governanceTab} filterState={filterState} />
      <div className="mt-4 flex flex-wrap gap-2">
        <GovernanceFilterMenu
          label={spaceLabel}
          onNavigate={navigate}
          disabled={isPending}
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
          onNavigate={navigate}
          disabled={isPending}
          items={(Object.keys(categoryLabels) as GovernanceHomeReviewCategory[]).map(key => ({
            label: categoryLabels[key],
            href: buildHomeHref({ tab: governanceTab, ...filterState, category: key }),
          }))}
        />
        <GovernanceFilterMenu
          label={statusLabel}
          onNavigate={navigate}
          disabled={isPending}
          items={(Object.keys(statusLabels) as GovernanceHomeStatusFilter[]).map(key => ({
            label: statusLabels[key],
            href: buildHomeHref({ tab: governanceTab, ...filterState, status: key }),
          }))}
        />
      </div>
      <div className="mt-4 flex gap-8">
        <div className="w-2/3">
          <Notices />
          <div
            aria-busy={isPending}
            className={cx('transition-opacity duration-150', isPending && 'pointer-events-none opacity-50')}
          >
            {children}
          </div>
        </div>
        <div className="w-1/3">{sidebar}</div>
      </div>
    </>
  );
}

function GovernanceFilterMenu({
  label,
  items,
  showImages,
  maxHeightClass,
  onNavigate,
  disabled,
}: {
  label: string;
  items: { label: string; href: string; image?: string | null; showImage?: boolean }[];
  showImages?: boolean;
  maxHeightClass?: string;
  onNavigate?: (href: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [pendingLabel, setPendingLabel] = React.useState<string | null>(null);
  const prevLabelRef = React.useRef(label);

  React.useEffect(() => {
    if (prevLabelRef.current !== label) {
      prevLabelRef.current = label;
      setPendingLabel(null);
    }
  }, [label]);

  const displayLabel = pendingLabel ?? label;

  return (
    <Menu
      open={open}
      onOpenChange={next => {
        if (disabled) return;
        setOpen(next);
      }}
      asChild
      viewportClassName={cx(
        'min-h-0 w-full min-w-0 overflow-y-auto overscroll-contain scroll-smooth bg-white [background-clip:padding-box]',
        maxHeightClass ?? 'max-h-[200px]'
      )}
      trigger={
        <SmallButton icon={<ChevronDownSmall />} disabled={disabled} className={cx(pendingLabel && 'opacity-70')}>
          {displayLabel}
        </SmallButton>
      }
    >
      <>
        {items.map(item => (
          <Link
            key={item.href}
            href={item.href}
            onClick={e => {
              if (onNavigate) e.preventDefault();
              if (item.label !== displayLabel) setPendingLabel(item.label);
              setOpen(false);
              onNavigate?.(item.href);
            }}
            className="flex w-full cursor-pointer items-center gap-2 bg-white px-3 py-2.5 hover:bg-bg"
          >
            {showImages && item.showImage !== false ? (
              item.image ? (
                <span className="relative h-5 w-5 shrink-0 overflow-hidden rounded-md">
                  <ThumbGeoImage value={item.image} alt="" />
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
      </>
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
          <div className="relative h-[102px] w-[128px] shrink-0 overflow-hidden sm:h-[108px] sm:w-[136px]" aria-hidden>
            <img
              src="/home.png"
              alt=""
              className="pointer-events-none block h-[calc(100%+21px)] min-h-0 w-full min-w-0 -translate-y-[21px] object-cover object-left object-top select-none sm:h-[calc(100%+24px)] sm:-translate-y-6"
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

  const classNames = cva('relative flex items-start gap-4 overflow-clip rounded-lg px-4 pt-4', {
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
    <div id={id} className={cx(classNames({ color }), media ? 'pb-6' : 'pb-4')}>
      <div className="min-w-0 flex-1">
        {media ? (
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-smallTitle">{title}</div>
              <div className="mt-2">{description}</div>
            </div>
            <div className="shrink-0 leading-none">{media}</div>
          </div>
        ) : (
          <>
            <div className="text-smallTitle">{title}</div>
            <div className="mt-2">{description}</div>
          </>
        )}
        {element && <div className="mt-2">{element}</div>}
      </div>
      <div className="shrink-0">
        <button type="button" onClick={handleDismissNotice} className="rounded border p-1">
          <Close />
        </button>
      </div>
    </div>
  );
};
