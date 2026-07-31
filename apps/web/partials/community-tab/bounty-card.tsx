'use client';

import * as React from 'react';

import type { BountyContributor, SpaceBounty } from '~/core/community/bounty-types';

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

/** Card box from the design: 249×143 including its 20px padding and 1px border. */
const CARD_STYLE = {
  boxSizing: 'border-box',
  width: 249,
  height: 143,
  padding: 20,
} as const satisfies React.CSSProperties;

const AVATAR_SIZE_PX = 16;

const MAX_CONTRIBUTORS_WITH_NAMES = 1;
const MAX_AVATARS = 3;

const TITLE_CLASS = 'text-[19px] leading-[21px] font-medium tracking-[-0.5px] text-[#2A2B2E]';
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
    <article style={CARD_STYLE} className="flex flex-col overflow-hidden rounded-lg border border-grey-02 bg-white">
      <div>
        <BudgetBadge budget={bounty.budget} />
      </div>

      <h3 className={`mt-3 line-clamp-2 min-w-0 ${TITLE_CLASS}`}>{bounty.name}</h3>

      <div className="mt-3">
        <ContributorRow contributors={bounty.contributors} />
      </div>
    </article>
  );
}
