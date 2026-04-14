'use client';

import * as React from 'react';

import { atomWithStorage } from 'jotai/utils';
import { useAtom } from 'jotai';

import { DOCUMENTATION_SPACE_ENTITY_ID, DOCUMENTATION_SPACE_ID } from '~/core/constants';
import { useGeoProfile } from '~/core/hooks/use-geo-profile';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { NavUtils } from '~/core/utils/utils';

import { BROWSE_NAV_ICON } from '~/core/browse/browse-nav-icon-src';
import type { BrowseSidebarData, BrowseSpaceRow } from '~/core/browse/fetch-browse-sidebar-data';

import { Avatar } from '~/design-system/avatar';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { ChevronRight } from '~/design-system/icons/chevron-right';
import { ThumbGeoImage } from '~/design-system/geo-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { loadBrowseSidebarData } from './load-browse-sidebar-data';

const browseSidebarOpenAtom = atomWithStorage<boolean>('browseSidebarOpen', false);

const navLinkClass =
  'flex items-center gap-2 rounded-md px-2 py-1.5 text-browseMenu font-normal not-italic text-text hover:bg-grey-01';

function BrowseNavIcon({ src }: { src: string }) {
  return (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-visible">
      <img
        src={src}
        alt=""
        width={20}
        height={20}
        className="h-5 w-5 max-h-none max-w-none object-contain"
        draggable={false}
      />
    </span>
  );
}

function BrowseNavPrimaryLinks({
  personalSpaceId,
  documentationImage,
}: {
  personalSpaceId: string | null;
  documentationImage: string | null;
}) {
  const { smartAccount } = useSmartAccount();
  const address = smartAccount?.account.address;
  const { profile } = useGeoProfile(address);

  return (
    <>
      <Link href={NavUtils.toRoot()} className={navLinkClass}>
        <BrowseNavIcon src={BROWSE_NAV_ICON.root} />
        <span>Root</span>
      </Link>
      {personalSpaceId ? (
        <Link href={NavUtils.toSpace(personalSpaceId)} className={navLinkClass}>
          <span className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full">
            <Avatar size={20} avatarUrl={profile?.avatarUrl} value={address ?? personalSpaceId} />
          </span>
          <span>Personal space</span>
        </Link>
      ) : null}
      <Link href={NavUtils.toHome()} className={navLinkClass}>
        <BrowseNavIcon src={BROWSE_NAV_ICON.governance} />
        <span>Governance</span>
      </Link>
      <Link
        href={NavUtils.toEntity(DOCUMENTATION_SPACE_ID, DOCUMENTATION_SPACE_ENTITY_ID)}
        className={navLinkClass}
      >
        <SpaceRowThumb
          row={{
            id: DOCUMENTATION_SPACE_ID,
            name: 'Documentation',
            image: documentationImage,
          }}
        />
        <span>Documentation</span>
      </Link>
    </>
  );
}

function SpaceRowThumb({ row }: { row: BrowseSpaceRow }) {
  if (!row.image) {
    const initial = row.name.trim().slice(0, 1).toUpperCase() || '?';
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-grey-01 text-[10px] font-medium text-grey-04 ring-1 ring-inset ring-grey-02/40">
        {initial}
      </span>
    );
  }
  return (
    <span className="relative h-5 w-5 shrink-0 overflow-hidden rounded-md">
      <ThumbGeoImage value={row.image} alt="" />
    </span>
  );
}

function SpaceRowLink({ row }: { row: BrowseSpaceRow }) {
  return (
    <Link
      href={NavUtils.toSpace(row.id)}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-browseMenu font-normal not-italic text-grey-04 hover:bg-grey-01 hover:text-text"
    >
      <SpaceRowThumb row={row} />
      <span className="min-w-0 flex-1 truncate">{row.name}</span>
    </Link>
  );
}

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
  hidden,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  hidden?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  if (hidden) return null;
  return (
    <div className="mt-3 border-t border-divider pt-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-browseMenu font-normal not-italic text-grey-04 hover:text-text"
      >
        <span>{title}</span>
        <span className={`transition-transform ${open ? '' : '-rotate-90'}`}>
          <ChevronDownSmall />
        </span>
      </button>
      {open ? <div className="mt-1 space-y-0.5">{children}</div> : null}
    </div>
  );
}

export function BrowseSidebar() {
  const [open, setOpen] = useAtom(browseSidebarOpenAtom);
  const { personalSpaceId: personalSpaceIdFromHook } = usePersonalSpaceId();
  const { smartAccount } = useSmartAccount();
  const walletAddress = smartAccount?.account.address;
  const [data, setData] = React.useState<BrowseSidebarData | null>(null);
  const personalSpaceId = data?.personalSpaceId ?? personalSpaceIdFromHook;

  React.useEffect(() => {
    let cancelled = false;
    void loadBrowseSidebarData(walletAddress).then(d => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  if (!open) {
    return (
      <aside
        className="relative sticky top-11 z-50 h-[calc(100dvh-2.75rem)] w-3 min-w-3 shrink-0 overflow-visible border-r border-divider bg-white"
        aria-label="Browse menu (collapsed)"
      >
        <button
          type="button"
          aria-label="Open browse menu"
          aria-expanded={false}
          onClick={() => setOpen(true)}
          className="absolute left-full top-2 z-50 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border border-grey-02 bg-white text-grey-04 shadow-[0_1px_2px_rgba(32,32,32,0.04)] transition-colors hover:border-grey-03 hover:bg-grey-01 hover:text-text active:scale-[0.98]"
        >
          <span className="inline-flex scale-[0.75]">
            <ChevronRight />
          </span>
        </button>
      </aside>
    );
  }

  return (
    <aside
      className="relative sticky top-11 z-50 flex h-[calc(100dvh-2.75rem)] w-[248px] min-w-[248px] shrink-0 flex-col overflow-visible border-r border-divider bg-white"
      aria-label="Browse menu"
    >
      <button
        type="button"
        aria-label="Close browse menu"
        aria-expanded
        onClick={() => setOpen(false)}
        className="absolute left-full top-2 z-[60] flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border border-grey-02 bg-white text-grey-04 shadow-[0_1px_2px_rgba(32,32,32,0.04)] transition-colors hover:border-grey-03 hover:bg-grey-01 hover:text-text active:scale-[0.98]"
      >
        <span className="inline-flex scale-[0.75] rotate-180">
          <ChevronRight />
        </span>
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-3 pl-3 pr-2 [text-edge:cap] [leading-trim:cap-height]">
        <nav className="space-y-0.5 pr-1">
          <BrowseNavPrimaryLinks
            personalSpaceId={personalSpaceId}
            documentationImage={data?.documentationImage ?? null}
          />
        </nav>

        {!data ? (
          <p className="mt-4 px-2 text-browseMenu font-normal not-italic text-grey-04">Loading spaces…</p>
        ) : (
          <>
            <CollapsibleSection title="Featured spaces" hidden={data.featured.length === 0}>
              {data.featured.map(row => (
                <SpaceRowLink key={row.id} row={row} />
              ))}
            </CollapsibleSection>
            <CollapsibleSection title="Editor of" hidden={data.editorOf.length === 0}>
              {data.editorOf.map(row => (
                <div key={row.id}>
                  <SpaceRowLink row={row} />
                  {row.pendingLabel ? (
                    <p className="px-2 pb-1 pl-9 text-browseMenu font-normal not-italic text-grey-04">{row.pendingLabel}</p>
                  ) : null}
                </div>
              ))}
            </CollapsibleSection>
            <CollapsibleSection title="Member of" hidden={data.memberOf.length === 0}>
              {data.memberOf.map(row => (
                <div key={row.id}>
                  <SpaceRowLink row={row} />
                  {row.pendingLabel ? (
                    <p className="px-2 pb-1 pl-9 text-browseMenu font-normal not-italic text-grey-04">{row.pendingLabel}</p>
                  ) : null}
                </div>
              ))}
            </CollapsibleSection>
          </>
        )}
      </div>
    </aside>
  );
}
