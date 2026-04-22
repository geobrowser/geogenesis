'use client';

import * as React from 'react';

import cx from 'classnames';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { NavUtils } from '~/core/utils/utils';

import { ThumbGeoImage } from '~/design-system/geo-image';
import { Gem } from '~/design-system/icons/gem';

import type { Bounty, BountyDifficulty, BountyStatus } from './types';

interface BountyCardProps {
  bounty: Bounty;
  isSelected: boolean;
  onToggle: (id: string) => void;
  /** Hides the selection checkbox/Linked label and disables toggling — used when rendering the
   *  read-only list of bounties already linked to a proposal. */
  readOnly?: boolean;
}

/**
 * Which payout label + value the card should show. Self-assigned bounties are paid out per
 * submission, so we label their budget as "Est. payout"; bounties with a fixed allocation
 * (Allocated / In progress / Completed / etc.) are labeled "Max payout".
 */
function getPayoutLabel(status: BountyStatus | null): 'Max payout' | 'Est. payout' {
  return status === 'SELF_ASSIGNED' ? 'Est. payout' : 'Max payout';
}

export function BountyCard({ bounty, isSelected, onToggle, readOnly = false }: BountyCardProps) {
  const formattedDeadline =
    bounty.deadline &&
    new Date(bounty.deadline).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const hasDetails =
    bounty.budget != null ||
    bounty.difficulty ||
    bounty.status ||
    bounty.userSubmissionsCount != null ||
    bounty.submissionsPerPerson != null ||
    formattedDeadline;

  const handleOpenBounty = () => {
    if (!bounty.spaceId) return;
    const url = NavUtils.toEntity(bounty.spaceId, bounty.id);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="py-4">
      {!readOnly && (
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={isSelected} onChange={() => onToggle(bounty.id)} className="sr-only" />
          <div
            className={cx(
              'flex h-4 w-4 items-center justify-center rounded border transition-all',
              isSelected ? 'border-text bg-text' : 'border-grey-03 bg-white'
            )}
          >
            {isSelected && (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          {isSelected && <span className="text-metadata font-medium text-text">Linked</span>}
        </label>
      )}

      {(bounty.spaceLabel ?? bounty.spaceId) && (
        <div className="mt-2 flex min-w-0 items-center gap-1.5">
          <span className="relative inline-flex size-[14px] shrink-0 items-center justify-center overflow-hidden rounded-sm border border-grey-03 bg-grey-01">
            <ThumbGeoImage
              value={bounty.spaceImage ?? PLACEHOLDER_SPACE_IMAGE}
              alt=""
              className="h-full w-full object-cover"
            />
          </span>
          <span className="min-w-0 truncate text-[14px] leading-snug text-text">{bounty.spaceLabel ?? bounty.spaceId}</span>
        </div>
      )}

      {/* Title */}
      <button
        type="button"
        onClick={handleOpenBounty}
        className="mt-2 text-left text-[15px] leading-tight font-semibold text-text hover:underline"
      >
        {bounty.name}
      </button>

      {/* Description */}
      {bounty.description ? (
        <p className="mt-2 line-clamp-3 text-[14px] leading-snug text-grey-04">{bounty.description}</p>
      ) : (
        <p className="mt-2 text-[14px] leading-snug text-grey-03 italic">No description</p>
      )}

      {/* Details table */}
      {hasDetails && (
        <div className="mt-3 flex flex-col gap-0">
          {bounty.budget != null && (
            <DetailRow label={getPayoutLabel(bounty.status)}>
              <span className="inline-flex items-center gap-1">
                <span className="text-purple">
                  <Gem color="purple" />
                </span>
                <span className="text-[14px] text-text">{bounty.budget.toLocaleString('en-US')}</span>
              </span>
            </DetailRow>
          )}

          {bounty.difficulty && (
            <DetailRow label="Difficulty">
              <span className="text-[14px] text-text">{formatDifficulty(bounty.difficulty)}</span>
            </DetailRow>
          )}

          {bounty.status && (
            <DetailRow label="Status">
              <span className="text-[14px] text-text">{formatStatus(bounty.status)}</span>
            </DetailRow>
          )}

          {(bounty.userSubmissionsCount != null || bounty.submissionsPerPerson != null) && (
            <DetailRow label="Your submissions">
              <span className="text-[14px] text-text">
                {(bounty.userSubmissionsCount ?? 0).toLocaleString('en-US')} /{' '}
                {bounty.submissionsPerPerson != null && bounty.submissionsPerPerson > 0
                  ? bounty.submissionsPerPerson.toLocaleString('en-US')
                  : 'Unlimited'}
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

function formatDifficulty(difficulty: BountyDifficulty): string {
  const map: Record<BountyDifficulty, string> = {
    LOW: 'Low',
    MEDIUM: 'Medium',
    HARD: 'Hard',
    EXPERT: 'Expert',
  };
  return map[difficulty];
}

function formatStatus(status: BountyStatus): string {
  const map: Record<BountyStatus, string> = {
    OPEN: 'Open',
    ALLOCATED: 'Allocated',
    SELF_ASSIGNED: 'Self-assigned',
    IN_PROGRESS: 'In progress',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
  };
  return map[status];
}
