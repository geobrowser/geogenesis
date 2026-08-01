'use client';

import * as React from 'react';

import type { BountyContributor, SpaceBounty } from '~/core/community/bounty-types';
import { useEntitySidePanel } from '~/core/hooks/use-entity-side-panel';
import { useSmartAccount } from '~/core/hooks/use-smart-account';

import { Avatar } from '~/design-system/avatar';

const GEO_ICON_WIDTH_PX = 8.5;
const GEO_ICON_HEIGHT_PX = 10;

/**
 * The Geo glyph from `/browse-nav/geo-curators.svg`, lifted out of that file's
 * purple circle badge so the mark itself carries the colour and the background
 * stays transparent. Kept local to this card so the sidebar keeps rendering the
 * original asset unchanged.
 */
function BountyGeoIcon() {
  return (
    <svg
      width={GEO_ICON_WIDTH_PX}
      height={GEO_ICON_HEIGHT_PX}
      viewBox="2.5 2 6.47 7.39"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <g transform="translate(2.5, 2)">
        <path
          d="M5.9088 7.05849C5.99719 7.20399 5.89245 7.39018 5.7222 7.39018H0.750041C0.579865 7.39018 0.475112 7.20412 0.56337 7.05862L1.00099 6.33717C1.06502 6.23161 1.20351 6.20066 1.31072 6.26191C1.87174 6.5824 2.52964 6.76713 3.23335 6.76713C3.93856 6.76707 4.59727 6.58117 5.15894 6.2593C5.26611 6.19788 5.4047 6.22871 5.46883 6.33427L5.9088 7.05849ZM3.04975 2.96342C3.13477 2.82339 3.33778 2.82339 3.4228 2.96342L4.88393 5.36983C4.94408 5.4689 4.91674 5.59845 4.81696 5.65743C4.35736 5.92909 3.81568 6.08836 3.23335 6.08842C2.65291 6.08842 2.11206 5.931 1.65321 5.66119C1.55317 5.60236 1.52567 5.47261 1.58592 5.37342L3.04975 2.96342Z"
          fill="currentColor"
        />
        <path
          d="M3.23315 5.88965C1.65156 5.88959 0.389404 4.64781 0.389405 3.13965C0.389526 1.63158 1.65164 0.389711 3.23315 0.389648C4.81472 0.389648 6.07678 1.63154 6.0769 3.13965C6.0769 4.64785 4.8148 5.88965 3.23315 5.88965Z"
          stroke="currentColor"
          strokeWidth="0.77833"
        />
      </g>
    </svg>
  );
}

export const CARD_WIDTH_PX = 249;
export const COMPLETED_CARD_HEIGHT_PX = 143;
export const IN_PROGRESS_CARD_HEIGHT_PX = 110;
export const AVAILABLE_CARD_WIDTH_PX = 378;
export const AVAILABLE_CARD_HEIGHT_PX = 240;
const CARD_PADDING_PX = 20;

function cardStyle(height: number, width: number = CARD_WIDTH_PX): React.CSSProperties {
  return { boxSizing: 'border-box', width, height, padding: CARD_PADDING_PX };
}

const CARD_CLASS = 'flex flex-col overflow-hidden rounded-lg border border-grey-02 bg-white text-left';

const CARD_INTERACTIVE_CLASS =
  'cursor-pointer transition-colors duration-150 hover:border-grey-03 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text';

/**
 * Runs alongside opening the side panel.
 */
const BountyCardActivateContext = React.createContext<(() => void) | null>(null);

export function BountyCardActivateProvider({
  onActivate,
  children,
}: {
  onActivate: () => void;
  children: React.ReactNode;
}) {
  return <BountyCardActivateContext.Provider value={onActivate}>{children}</BountyCardActivateContext.Provider>;
}

/**
 * Card frame. For a signed-in viewer, clicking anywhere that isn't a nested control opens the
 * bounty in the entity side panel, which is mounted globally in `app/entry.tsx`.
 */
function BountyCardShell({
  bounty,
  height,
  width,
  className,
  children,
}: {
  bounty: SpaceBounty;
  height: number;
  width?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const { openSidePanel } = useEntitySidePanel();
  const { smartAccount } = useSmartAccount();
  const onActivate = React.useContext(BountyCardActivateContext);

  const isLoggedIn = Boolean(smartAccount?.account.address);
  const style = cardStyle(height, width);
  const classes = [CARD_CLASS, isLoggedIn && CARD_INTERACTIVE_CLASS, className].filter(Boolean).join(' ');

  if (!isLoggedIn) {
    return (
      <article data-bounty-card style={style} className={classes}>
        {children}
      </article>
    );
  }

  const open = () => {
    onActivate?.();
    openSidePanel(bounty.id, bounty.spaceId, false);
  };

  return (
    <article
      role="button"
      tabIndex={0}
      data-entity-side-panel-opener
      data-bounty-card
      aria-label={`Open ${bounty.name}`}
      onClick={open}
      onKeyDown={event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        open();
      }}
      style={style}
      className={classes}
    >
      {children}
    </article>
  );
}

const AVATAR_SIZE_PX = 16;

const MAX_CONTRIBUTORS_WITH_NAMES = 1;
const MAX_AVATARS = 3;

const TITLE_CLASS = 'text-[19px] leading-[21px] font-medium tracking-[-0.5px] text-[#2A2B2E]';
const DESCRIPTION_CLASS = 'text-[18px] leading-[21px] font-normal tracking-[-0.35px] text-grey-04';
const NAME_CLASS = 'text-[16px] leading-[13px] font-normal tracking-[-0.35px] text-grey-04';
const COUNT_CLASS = 'text-[16px] leading-[13px] font-normal tracking-[-0.35px] text-purple';

function ContributorAvatar({ contributor }: { contributor: BountyContributor }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-full"
      style={{ width: AVATAR_SIZE_PX, height: AVATAR_SIZE_PX }}
    >
      <Avatar
        value={contributor.entityId}
        avatarUrl={contributor.avatarUrl}
        alt={contributor.name}
        size={AVATAR_SIZE_PX}
      />
    </div>
  );
}

function ContributorRow({ contributors }: { contributors: BountyContributor[] }) {
  if (contributors.length === 0) return null;

  if (contributors.length <= MAX_CONTRIBUTORS_WITH_NAMES) {
    const [contributor] = contributors;
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <ContributorAvatar contributor={contributor} />
        <span className={`min-w-0 truncate ${NAME_CLASS}`}>{contributor.name}</span>
      </div>
    );
  }

  const visible = contributors.slice(0, MAX_AVATARS);
  const overflow = contributors.length - visible.length;

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex -space-x-1">
        {visible.map(contributor => (
          <div key={contributor.entityId} className="rounded-full ring-2 ring-white" title={contributor.name}>
            <ContributorAvatar contributor={contributor} />
          </div>
        ))}
      </div>
      {overflow > 0 ? <span className={NAME_CLASS}>+{overflow}</span> : null}
    </div>
  );
}

const BADGE_CONTENT_HEIGHT_PX = 13;

function BudgetBadge({ budget }: { budget: number | null }) {
  return (
    <div
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#EDE7FF] px-2 py-1 text-purple"
      title="Bounty budget"
    >
      <span
        className="flex shrink-0 items-center justify-center"
        style={{ height: BADGE_CONTENT_HEIGHT_PX, width: GEO_ICON_WIDTH_PX }}
      >
        <BountyGeoIcon />
      </span>
      <span className={`flex items-center ${COUNT_CLASS}`} style={{ height: BADGE_CONTENT_HEIGHT_PX }}>
        {budget ?? 0}
      </span>
    </div>
  );
}

export function BountyCard({ bounty }: { bounty: SpaceBounty }) {
  return (
    <BountyCardShell bounty={bounty} height={COMPLETED_CARD_HEIGHT_PX}>
      <div>
        <BudgetBadge budget={bounty.budget} />
      </div>

      <h3 className={`mt-3 line-clamp-2 min-w-0 ${TITLE_CLASS}`}>{bounty.name}</h3>

      <div className="mt-3">
        <ContributorRow contributors={bounty.contributors} />
      </div>
    </BountyCardShell>
  );
}

function SkillPills({ skills }: { skills: string[] }) {
  if (skills.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 overflow-hidden">
      {skills.map(skill => (
        <span
          key={skill}
          className="inline-flex shrink-0 items-center rounded-full border border-grey-02 bg-white px-2 py-1 text-[16px] leading-[13px] font-normal tracking-[-0.35px] text-grey-04"
        >
          {skill}
        </span>
      ))}
    </div>
  );
}

const INTEREST_BUTTON_CLASS =
  'inline-flex shrink-0 items-center rounded-full px-[10px] py-[7px] text-[16px] leading-[20px] font-normal';

/**
 * Two states, driven by whether an `Interested in` relation already exists from
 * the viewer to this bounty:
 */
function InterestButton({
  isInterested,
  isPending,
  canRegisterInterest,
  onClick,
}: {
  isInterested: boolean;
  isPending: boolean;
  canRegisterInterest: boolean;
  onClick: () => void;
}) {
  if (isInterested) {
    return <span className={`${INTEREST_BUTTON_CLASS} bg-grey-01 text-grey-04`}>Awaiting allocation</span>;
  }

  return (
    <button
      type="button"
      onClick={event => {
        event.stopPropagation();
        onClick();
      }}
      disabled={isPending || !canRegisterInterest}
      title={canRegisterInterest ? undefined : 'You need a registered personal space to register interest'}
      className={`${INTEREST_BUTTON_CLASS} bg-[#151515] text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {isPending ? 'Saving…' : "I'm interested"}
    </button>
  );
}

/**
 * Available card.
 */
export function AvailableBountyCard({
  bounty,
  isInterested,
  isPending,
  canRegisterInterest,
  onRegisterInterest,
}: {
  bounty: SpaceBounty;
  isInterested: boolean;
  isPending: boolean;
  canRegisterInterest: boolean;
  onRegisterInterest: (bounty: SpaceBounty) => void;
}) {
  return (
    <BountyCardShell bounty={bounty} height={AVAILABLE_CARD_HEIGHT_PX} width={AVAILABLE_CARD_WIDTH_PX}>
      <div className="flex shrink-0 items-center justify-between gap-3">
        <BudgetBadge budget={bounty.budget} />
        <InterestButton
          isInterested={isInterested}
          isPending={isPending}
          canRegisterInterest={canRegisterInterest}
          onClick={() => onRegisterInterest(bounty)}
        />
      </div>

      {/* 12px badge row → title, 8px title → description, 20px description → skills. */}
      <h3 className={`mt-3 line-clamp-3 min-h-0 min-w-0 ${TITLE_CLASS}`}>{bounty.name}</h3>

      {bounty.description ? (
        <p className={`mt-2 line-clamp-3 min-h-0 min-w-0 ${DESCRIPTION_CLASS}`}>{bounty.description}</p>
      ) : null}

      <div className="mt-5 shrink-0">
        <SkillPills skills={bounty.skills} />
      </div>
    </BountyCardShell>
  );
}

export function InProgressBountyCard({ bounty }: { bounty: SpaceBounty }) {
  return (
    <BountyCardShell bounty={bounty} height={IN_PROGRESS_CARD_HEIGHT_PX} className="justify-between">
      <h3 className={`line-clamp-3 min-h-0 min-w-0 ${TITLE_CLASS}`}>{bounty.name}</h3>

      <div className="shrink-0">
        <ContributorRow contributors={bounty.contributors} />
      </div>
    </BountyCardShell>
  );
}
