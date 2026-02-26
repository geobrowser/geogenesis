'use client';

import cx from 'classnames';

import * as React from 'react';

import { Gem } from '~/design-system/icons/gem';
import { NavUtils } from '~/core/utils/utils';

import { Bounty, BountyDifficulty, BountyStatus } from './types';

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

  const formattedPayout = bounty.maxPayout != null ? bounty.maxPayout.toLocaleString('en-US') : null;

  const hasDetails =
    bounty.budget != null ||
    bounty.maxContributors != null ||
    bounty.submissionsPerPerson != null ||
    bounty.submissionsCount != null ||
    bounty.userSubmissionsCount != null ||
    formattedPayout ||
    bounty.difficulty ||
    bounty.status ||
    formattedDeadline;

  const handleOpenBounty = () => {
    if (!bounty.spaceId) return;
    const url = NavUtils.toEntity(bounty.spaceId, bounty.id);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="py-4">
      {/* Checkbox row */}
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggle(bounty.id)}
          className="sr-only"
        />
        <div
          className={cx(
            'flex h-4 w-4 items-center justify-center rounded border transition-all',
            isSelected ? 'border-text bg-text' : 'border-grey-03 bg-white'
          )}
        >
          {isSelected && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M2 5L4 7L8 3"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
        {isSelected && <span className="text-metadata font-medium text-text">Linked</span>}
      </label>

      {/* Title */}
      <button
        type="button"
        onClick={handleOpenBounty}
        className="mt-3 text-left text-[15px] font-semibold leading-tight text-text hover:underline"
      >
        {bounty.name}
      </button>

      {/* Description */}
      {bounty.description ? (
        <p className="mt-2 line-clamp-3 text-[14px] leading-snug text-grey-04">{bounty.description}</p>
      ) : (
        <p className="mt-2 text-[14px] italic leading-snug text-grey-03">No description</p>
      )}

      {/* Details table */}
      {hasDetails && (
        <div className="mt-3 flex flex-col gap-0">
          {bounty.budget != null && (
            <DetailRow label="Bounty budget">
              <span className="inline-flex items-center gap-1">
                <span className="text-purple">
                  <Gem color="purple" />
                </span>
                <span className="text-[14px] text-text">{bounty.budget.toLocaleString('en-US')}</span>
              </span>
            </DetailRow>
          )}
          {formattedPayout && (
            <DetailRow label="Max payout">
              <span className="inline-flex items-center gap-1">
                <span className="text-purple">
                  <Gem color="purple" />
                </span>
                <span className="text-[14px] text-text">{formattedPayout}</span>
              </span>
            </DetailRow>
          )}

          {bounty.maxContributors != null && (
            <DetailRow label="Submissions">
              <span className="text-[14px] text-text">
                {(bounty.submissionsCount ?? 0).toLocaleString('en-US')} / {bounty.maxContributors.toLocaleString('en-US')}
              </span>
            </DetailRow>
          )}

          {bounty.submissionsPerPerson != null && (
            <DetailRow label="Your submissions">
              <span className="text-[14px] text-text">
                {(bounty.userSubmissionsCount ?? 0).toLocaleString('en-US')} /{' '}
                {bounty.submissionsPerPerson.toLocaleString('en-US')}
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
