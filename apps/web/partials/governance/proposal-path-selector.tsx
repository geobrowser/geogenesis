'use client';

import * as React from 'react';

import type { ProposalVotingMode } from '~/core/hooks/use-publish';

import { Dropdown } from '~/design-system/dropdown';
import { FastPath } from '~/design-system/icons/fast-path';
import { Time } from '~/design-system/icons/time';

import type { VotingSettingsSnapshot } from './voting-settings';

type Props = {
  votingMode: ProposalVotingMode;
  onChange: (mode: ProposalVotingMode) => void;
  /** Current on-chain settings, used to fill in the option copy. Null while loading. */
  votingSettings: VotingSettingsSnapshot | null;
  /**
   * Whether this author holds the space's FAST_PATH_RESTRICTED role. Shown disabled
   * rather than hidden: a silently missing option reads as a bug, while an explained
   * one tells the user the rule exists and that it lifts.
   */
  isFastPathRestricted?: boolean;
};

/**
 * Lets an editor pick whether a DAO proposal takes the fast path (instant approval) or
 * the review/slow path (a timed vote). Design 62501-94092. The option copy reflects the
 * space's actual voting settings.
 */
export function ProposalPathSelector({ votingMode, onChange, votingSettings, isFastPathRestricted = false }: Props) {
  // flatSupportThreshold of 0 still means a single editor vote approves, so show at least 1.
  const fastEditors = Math.max(1, votingSettings?.flat ?? 1);
  const durationHours = votingSettings ? Math.max(1, Math.round(votingSettings.durationSeconds / 3600)) : 24;
  const passPercent = votingSettings ? Math.round(votingSettings.partialPercent) : 51;

  const options = [
    {
      value: 'FAST',
      disabled: isFastPathRestricted,
      onClick: () => {
        if (isFastPathRestricted) return;
        onChange('FAST');
      },
      label: (
        <OptionLabel
          icon={<FastPath />}
          title="Fast path"
          description={
            isFastPathRestricted
              ? 'Not available to you yet — this space restricts the fast path for new members'
              : `Only requires ${fastEditors} editor${fastEditors === 1 ? '' : 's'} to instantly approve the proposal`
          }
        />
      ),
    },
    {
      value: 'SLOW',
      disabled: false,
      onClick: () => onChange('SLOW'),
      label: (
        <OptionLabel
          icon={<Time />}
          title="Review path"
          description={`Goes to a review over ${durationHours} hour${durationHours === 1 ? '' : 's'} and requires a ${passPercent}% pass rate`}
        />
      ),
    },
  ];

  return (
    <Dropdown
      align="end"
      trigger={
        <span className="flex items-center gap-1.5">
          {votingMode === 'FAST' ? <FastPath /> : <Time />}
          {votingMode === 'FAST' ? 'Fast path' : 'Review path'}
        </span>
      }
      options={options}
    />
  );
}

function OptionLabel({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-text">
        <span className="text-grey-04">{icon}</span>
        <span className="text-button text-text">{title}</span>
      </div>
      <span className="text-metadata font-normal whitespace-normal text-grey-04">{description}</span>
    </div>
  );
}
