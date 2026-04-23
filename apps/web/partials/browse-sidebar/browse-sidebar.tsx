'use client';

import * as React from 'react';

import { usePathname } from 'next/navigation';
import { useAtom } from 'jotai';

import { DOCUMENTATION_SPACE_ENTITY_ID, DOCUMENTATION_SPACE_ID } from '~/core/constants';
import { browseSidebarOpenAtom } from '~/core/state/browse-sidebar-state';
import { useGeoProfile } from '~/core/hooks/use-geo-profile';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSpaceId } from '~/core/hooks/use-space-id';
import { NavUtils, getImagePath } from '~/core/utils/utils';

import { BROWSE_NAV_ICON } from '~/core/browse/browse-nav-icon-src';
import { GEO_APPS_SIDEBAR_EXTERNAL_ICON, GEO_APPS_SIDEBAR_LINKS } from '~/core/browse/geo-apps-sidebar-src';
import type { BrowseSidebarData, BrowseSpaceRow } from '~/core/browse/fetch-browse-sidebar-data';

import { Avatar } from '~/design-system/avatar';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { ChevronRight } from '~/design-system/icons/chevron-right';
import { FallbackImage } from '~/design-system/fallback-image';
import { GeoLogoLarge } from '~/design-system/icons/geo-logo-large';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { loadBrowseSidebarData } from './load-browse-sidebar-data';

const SIDEBAR_WIDTH_PX = 200;

/** Warm the HTTP cache for sidebar thumbs before the panel is opened (thumbs mount only when expanded). */
function collectBrowseSidebarImageHrefs(data: BrowseSidebarData): string[] {
  const seen = new Set<string>();
  const add = (image: string | null | undefined) => {
    if (image) seen.add(getImagePath(image));
  };
  for (const row of data.featured) add(row.image);
  for (const row of data.editorOf) add(row.image);
  for (const row of data.memberOf) add(row.image);
  return [...seen];
}

const navLinkBase =
  'flex items-center gap-3 rounded-lg p-2.5 text-browseMenu font-normal not-italic';
const navLinkIdle = `${navLinkBase} text-text hover:bg-grey-01`;
const navLinkActive = `${navLinkBase} bg-divider text-text`;

function BrowseNavIcon({ src }: { src: string }) {
  return (
    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center overflow-visible">
      <img
        src={src}
        alt=""
        width={16}
        height={16}
        className="h-4 w-4 max-h-none max-w-none object-contain"
        draggable={false}
      />
    </span>
  );
}

/**
 * Renders both the idle and active SVGs stacked, toggling visibility via class —
 * avoids an img `src` change so the paint happens in the same frame as the pill
 * background class update.
 */
function BrowseNavIconSwap({
  idleSrc,
  activeSrc,
  isActive,
}: {
  idleSrc: string;
  activeSrc: string;
  isActive: boolean;
}) {
  return (
    <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
      <img
        src={idleSrc}
        alt=""
        width={16}
        height={16}
        className={`absolute inset-0 h-4 w-4 max-h-none max-w-none object-contain ${isActive ? 'invisible' : ''}`}
        draggable={false}
      />
      <img
        src={activeSrc}
        alt=""
        width={16}
        height={16}
        className={`absolute inset-0 h-4 w-4 max-h-none max-w-none object-contain ${isActive ? '' : 'invisible'}`}
        draggable={false}
      />
    </span>
  );
}

function GeoAppsSidebarLinks() {
  return (
    <>
      {GEO_APPS_SIDEBAR_LINKS.map(item => (
        <a
          key={item.href}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className={navLinkIdle}
        >
          <BrowseNavIcon src={item.icon} />
          <span className="min-w-0 flex-1 overflow-hidden">
            <p className="-my-0.5 truncate leading-5">{item.label}</p>
          </span>
          <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-grey-04">
            <img
              src={GEO_APPS_SIDEBAR_EXTERNAL_ICON}
              alt=""
              width={16}
              height={16}
              className="h-4 w-4 max-h-none max-w-none object-contain"
              draggable={false}
            />
          </span>
        </a>
      ))}
    </>
  );
}

function BrowseNavPrimaryLinks({ personalSpaceId }: { personalSpaceId: string | null }) {
  const { smartAccount } = useSmartAccount();
  const address = smartAccount?.account.address;
  const isSignedIn = !!address;
  const { profile } = useGeoProfile(address);
  const pathname = usePathname() ?? '';

  const isExplore = pathname === '/explore' || pathname.startsWith('/explore/');
  const isRoot = pathname === '/root';
  const isGovernance = pathname === '/home' || pathname.startsWith('/home/');
  const personalHref = personalSpaceId ? NavUtils.toSpace(personalSpaceId) : null;
  const isPersonal = !!personalHref && pathname === personalHref;
  const docHref = NavUtils.toEntity(DOCUMENTATION_SPACE_ID, DOCUMENTATION_SPACE_ENTITY_ID);
  const isDoc = pathname.startsWith(`/space/${DOCUMENTATION_SPACE_ID}`);

  return (
    <>
      <Link href={NavUtils.toExplore()} className={isExplore ? navLinkActive : navLinkIdle}>
        <BrowseNavIconSwap
          idleSrc={BROWSE_NAV_ICON.exploreOutline}
          activeSrc={BROWSE_NAV_ICON.explore}
          isActive={isExplore}
        />
        <span>Explore</span>
      </Link>
      {personalSpaceId && personalHref ? (
        <Link href={personalHref} className={isPersonal ? navLinkActive : navLinkIdle}>
          <span className="relative h-4 w-4 shrink-0 overflow-hidden rounded-[4px] bg-grey-01">
            {profile?.avatarUrl ? (
              <FallbackImage value={profile.avatarUrl} sizes="32px" className="object-cover" />
            ) : (
              <Avatar size={16} avatarUrl={null} value={address ?? personalSpaceId} square />
            )}
          </span>
          <span>Personal space</span>
        </Link>
      ) : null}
      {isSignedIn ? (
        <Link href={NavUtils.toHome()} className={isGovernance ? navLinkActive : navLinkIdle}>
          <BrowseNavIconSwap
            idleSrc={BROWSE_NAV_ICON.governance}
            activeSrc={BROWSE_NAV_ICON.governanceFilled}
            isActive={isGovernance}
          />
          <span>Governance</span>
        </Link>
      ) : null}
      <Link href={NavUtils.toRoot()} className={isRoot ? navLinkActive : navLinkIdle}>
        <BrowseNavIcon src={BROWSE_NAV_ICON.root} />
        <span>Root</span>
      </Link>
      <Link href={docHref} className={isDoc ? navLinkActive : navLinkIdle}>
        <BrowseNavIconSwap
          idleSrc={BROWSE_NAV_ICON.docs}
          activeSrc={BROWSE_NAV_ICON.docsFilled}
          isActive={isDoc}
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
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] bg-grey-01 text-[8px] font-medium text-grey-04 ring-1 ring-inset ring-grey-02/40">
        {initial}
      </span>
    );
  }
  return (
    <span className="relative h-4 w-4 shrink-0 overflow-hidden rounded-[4px] bg-grey-01">
      <FallbackImage value={row.image} sizes="32px" className="object-cover" />
    </span>
  );
}

function SpaceRowLink({ row }: { row: BrowseSpaceRow }) {
  const activeSpaceId = useSpaceId();
  const isActive = activeSpaceId === row.id;
  return (
    <Link
      href={NavUtils.toSpace(row.id)}
      className={`flex items-center gap-3 rounded-lg p-2.5 text-browseMenu font-normal not-italic ${
        isActive ? 'bg-divider text-text' : 'text-text hover:bg-grey-01'
      }`}
    >
      <SpaceRowThumb row={row} />
      <span className="min-w-0 flex-1 overflow-hidden">
        <p className="-my-0.5 truncate leading-5">{row.name}</p>
      </span>
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
        className="flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-browseSection font-normal not-italic text-grey-04 hover:text-text"
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

function SidebarToggle({
  open,
  onToggle,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={open ? 'Close browse menu' : 'Open browse menu'}
      aria-expanded={open}
      onClick={onToggle}
      className={`absolute z-[60] flex h-5 w-5 items-center justify-center rounded-full border border-grey-02 bg-white text-grey-04 shadow-[0_1px_2px_rgba(32,32,32,0.04)] transition-colors hover:border-grey-03 hover:bg-grey-01 hover:text-text ${className ?? ''}`}
    >
      <span className={`inline-flex scale-[0.7] ${open ? 'rotate-180' : ''}`}>
        <ChevronRight />
      </span>
    </button>
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

  React.useEffect(() => {
    if (!data) return;
    for (const href of collectBrowseSidebarImageHrefs(data)) {
      const img = new Image();
      img.decoding = 'async';
      img.src = href;
    }
  }, [data]);

  // Preload both idle and active variants of nav icons so the swap on click
  // is instant (otherwise the fresh SVG has to fetch and the icon updates a
  // beat after the pill background).
  React.useEffect(() => {
    for (const src of Object.values(BROWSE_NAV_ICON)) {
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
    }
  }, []);

  if (!open) {
    return (
      <aside
        className="pointer-events-none sticky top-0 z-50 h-dvh w-0 shrink-0 overflow-visible"
        aria-label="Browse menu (collapsed)"
      >
        {/* Vertical rail aligned to the centre of the navbar logo (navbar px-4 = 16px + 8px half-logo ≈ 24px). */}
        <div className="pointer-events-none absolute bottom-0 left-6 top-0 w-px bg-divider" />
        <SidebarToggle
          open={false}
          onToggle={() => setOpen(true)}
          className="pointer-events-auto left-3.5 top-[3.25rem]"
        />
      </aside>
    );
  }

  return (
    <aside
      className="relative sticky top-0 z-50 flex h-dvh shrink-0 flex-col overflow-visible border-r border-divider bg-white"
      style={{ width: SIDEBAR_WIDTH_PX, minWidth: SIDEBAR_WIDTH_PX }}
      aria-label="Browse menu"
    >
      <div className="flex h-11 shrink-0 items-center px-4">
        <Link href={NavUtils.toRoot()} aria-label="Geo">
          <GeoLogoLarge />
        </Link>
      </div>

      <SidebarToggle
        open
        onToggle={() => setOpen(false)}
        className="right-0 top-[calc(2.75rem+0.75rem)] translate-x-1/2"
      />

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3">
        <nav className="space-y-0.5">
          <BrowseNavPrimaryLinks personalSpaceId={personalSpaceId} />
        </nav>

        <CollapsibleSection title="Geo Apps">
          <GeoAppsSidebarLinks />
        </CollapsibleSection>

        {!data ? (
          <p className="mt-4 px-2 text-browseMenu not-italic text-grey-04">Loading spaces…</p>
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
                    <p className="px-2 pb-1 pl-9 text-browseSection not-italic text-grey-04">{row.pendingLabel}</p>
                  ) : null}
                </div>
              ))}
            </CollapsibleSection>
            <CollapsibleSection title="Member of" hidden={data.memberOf.length === 0}>
              {data.memberOf.map(row => (
                <div key={row.id}>
                  <SpaceRowLink row={row} />
                  {row.pendingLabel ? (
                    <p className="px-2 pb-1 pl-9 text-browseSection not-italic text-grey-04">{row.pendingLabel}</p>
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
