'use client';

import * as React from 'react';

import { useSpace } from '~/core/hooks/use-space';
import { useVotingSettings } from '~/core/hooks/use-voting-settings';
import type { Proposal } from '~/core/io/dto/proposals';

import type { VotingSettingsSnapshot } from '~/partials/governance/voting-settings';

type Props = {
  proposal: Proposal;
  spaceId: string;
};

/**
 * Renders the change an `UPDATE_VOTING_SETTINGS` proposal makes to a space's voting
 * settings. The proposed (new) values come from the proposal action; the current (old)
 * values are read on-chain. Only the four user-facing fields the API carries are shown —
 * slow-path threshold, fast-path votes, quorum, and vote duration.
 */
export function VotingSettingsProposal({ proposal, spaceId }: Props) {
  const { space } = useSpace(spaceId);
  const { votingSettings: current, isLoading: isLoadingCurrent } = useVotingSettings(space?.address);

  const details = proposal.votingSettingsDetails;

  if (!details) {
    return <p className="text-body text-grey-04">This proposal updates the space&apos;s voting settings.</p>;
  }

  const rows = buildRows(details, current);

  return (
    <div className="mx-auto max-w-[560px]">
      <h3 className="text-smallTitle">Proposed governance settings</h3>
      <p className="pt-1 text-metadata text-grey-04">
        If this proposal passes, the space&apos;s voting settings change as follows.
      </p>
      <div className="mt-5 divide-y divide-divider rounded-lg border border-grey-02">
        {rows.map(row => (
          <div key={row.label} className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="text-metadata text-grey-04">{row.label}</span>
            <div className="flex items-center gap-2 text-quoteMedium tabular-nums">
              {row.changed && row.current !== null && (
                <>
                  <span className="text-grey-03 line-through">{row.current}</span>
                  <span aria-hidden className="text-grey-03">
                    →
                  </span>
                </>
              )}
              <span className={row.changed ? 'text-text' : 'text-grey-04'}>{row.proposed}</span>
            </div>
          </div>
        ))}
      </div>
      {current === null && !isLoadingCurrent && (
        <p className="pt-3 text-metadata text-grey-04">
          Current settings couldn&apos;t be read, so only the proposed values are shown.
        </p>
      )}
    </div>
  );
}

type Row = {
  label: string;
  /** Current on-chain value, formatted; null when unknown (still loading or unreadable). */
  current: string | null;
  proposed: string;
  changed: boolean;
};

function buildRows(
  details: NonNullable<Proposal['votingSettingsDetails']>,
  current: VotingSettingsSnapshot | null
): Row[] {
  const rows: Row[] = [];

  if (details.slowThreshold !== undefined) {
    rows.push(
      makeRow(
        'Slow path threshold',
        current ? formatPercent(current.partialPercent) : null,
        formatPercent(ratioToPercent(details.slowThreshold))
      )
    );
  }
  if (details.fastThreshold !== undefined) {
    rows.push(makeRow('Fast path votes', current ? String(current.flat) : null, String(details.fastThreshold)));
  }
  if (details.quorum !== undefined) {
    rows.push(makeRow('Quorum', current ? String(current.quorum) : null, String(details.quorum)));
  }
  if (details.durationSeconds !== undefined) {
    rows.push(
      makeRow(
        'Vote duration',
        current ? formatDuration(current.durationSeconds) : null,
        formatDuration(details.durationSeconds)
      )
    );
  }

  return rows;
}

function makeRow(label: string, current: string | null, proposed: string): Row {
  return { label, current, proposed, changed: current === null ? true : current !== proposed };
}

/**
 * The API sends the slow-path threshold as the raw contract ratio (1e7 = 100%). Guard
 * against a future API that already sends a percentage: any real threshold as a ratio is
 * far above 100, while a percentage is 0–100, so the boundary is unambiguous in practice.
 */
function ratioToPercent(value: number): number {
  return value > 100 ? value / 100000 : value;
}

function formatPercent(percent: number): string {
  const rounded = Math.round(percent * 10) / 10;
  return `${rounded}%`;
}

function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return '—';
  }

  const whole = Math.round(totalSeconds);
  const days = Math.floor(whole / 86400);
  const hours = Math.floor((whole % 86400) / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;

  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds) parts.push(`${seconds}s`);

  return parts.join(' ') || '0s';
}
