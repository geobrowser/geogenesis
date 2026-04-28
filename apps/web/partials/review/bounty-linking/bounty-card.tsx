'use client';

import * as React from 'react';

import cx from 'classnames';

import { BOUNTY_EST_PAYOUT_RATIO, PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { NavUtils } from '~/core/utils/utils';

import { ThumbGeoImage } from '~/design-system/geo-image';
import { Gem } from '~/design-system/icons/gem';

import type { Bounty } from './types';

interface BountyCardProps {
  bounty: Bounty;
  isSelected: boolean;
  onToggle: (id: string) => void;
}

export function BountyCard({ bounty, isSelected, onToggle }: BountyCardProps) {
  const formattedDeadline =
    bounty.deadline &&
    new Date(bounty.deadline).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const estPayout = bounty.budget != null ? Math.round(bounty.budget * BOUNTY_EST_PAYOUT_RATIO) : null;

  const hasDetails =
    estPayout != null ||
    bounty.difficulty ||
    bounty.status ||
    bounty.userSubmissionsCount != null ||
    formattedDeadline;

  const handleOpenBounty = () => {
    if (!bounty.spaceId) return;
    const url = NavUtils.toEntity(bounty.spaceId, bounty.id);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="py-4">
      <div className="flex items-center justify-between gap-2">
        {(bounty.spaceLabel ?? bounty.spaceId) ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="relative inline-flex size-[14px] shrink-0 items-center justify-center overflow-hidden rounded-sm border border-grey-03 bg-grey-01">
              <ThumbGeoImage
                value={bounty.spaceImage ?? PLACEHOLDER_SPACE_IMAGE}
                alt=""
                className="h-full w-full object-cover"
              />
            </span>
            <span className="min-w-0 truncate text-[14px] leading-snug text-text">{bounty.spaceLabel ?? bounty.spaceId}</span>
          </div>
        ) : (
          <span />
        )}
        <label className="flex shrink-0 cursor-pointer items-center">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggle(bounty.id)}
            className="sr-only"
            aria-label={isSelected ? `Unlink ${bounty.name}` : `Link ${bounty.name}`}
          />
          <div
            className={cx(
              'flex h-4 w-4 items-center justify-center rounded border transition-all',
              isSelected ? 'border-text bg-text' : 'border-grey-03 bg-white'
            )}
            aria-hidden
          >
            {isSelected && (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        </label>
      </div>

      <button
        type="button"
        onClick={handleOpenBounty}
        className="mt-2 text-left text-[15px] leading-tight font-semibold text-text hover:underline"
      >
        {bounty.name}
      </button>

      {bounty.description && (
        <p className="mt-2 line-clamp-3 text-[14px] leading-snug text-grey-04">{bounty.description}</p>
      )}

      {hasDetails && (
        <div className="mt-3 flex flex-col gap-0">
          {estPayout != null && (
            <DetailRow label="Est. payout">
              <span className="inline-flex items-center gap-1">
                <span className="text-purple">
                  <Gem color="purple" />
                </span>
                <span className="text-[14px] text-text">{estPayout.toLocaleString('en-US')}</span>
              </span>
            </DetailRow>
          )}

          {bounty.difficulty && (
            <DetailRow label="Difficulty">
              <span className="text-[14px] text-text">{bounty.difficulty}</span>
            </DetailRow>
          )}

          {bounty.status && (
            <DetailRow label="Status">
              <span className="text-[14px] text-text">{bounty.status}</span>
            </DetailRow>
          )}

          {bounty.userSubmissionsCount != null && (
            <DetailRow label="Your submissions">
              <span className="text-[14px] text-text">
                {bounty.userSubmissionsCount.toLocaleString('en-US')}
              </span>
            </DetailRow>
          )}

          {formattedDeadline && (
            <DetailRow label="Deadline">
              <span className="text-[14px] text-text">{formattedDeadline}</span>
            </DetailRow>
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[14px] text-grey-04">{label}</span>
      {children}
    </div>
  );
}
