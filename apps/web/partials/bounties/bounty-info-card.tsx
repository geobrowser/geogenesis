'use client';

import * as React from 'react';

import { formatDeadline, formatPayoutRange, formatPoints, isBountyEnded, payoutRange } from '~/core/bounties/payout';
import type { BoardBounty } from '~/core/bounties/types';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { NavUtils } from '~/core/utils/utils';

import { ThumbGeoImage } from '~/design-system/geo-image';
import { Gem } from '~/design-system/icons/gem';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Tag } from '~/design-system/tag';
import { Tooltip } from '~/design-system/tooltip';

/** Field explanations, ported from curator-app's bounty-tooltips so both apps say the same thing. */
export const BOUNTY_FIELD_HELP = {
  budget: 'Total points set aside for this bounty across all contributors.',
  payoutRange: 'What one accepted submission is expected to earn. Editors decide the exact amount when reviewing.',
  deadline: 'Submissions after this date are not eligible for payout.',
  maxContributors: 'How many curators can be allocated to this bounty at once.',
  maxSubmissionsPerPerson: 'How many separate submissions one curator may make.',
  submissions: 'Proposals in this space that have been linked to the bounty.',
  interested: 'Curators who have applied and are waiting to be allocated.',
  allocated: 'Curators an editor has assigned to work on this bounty.',
  status: 'Workflow status, visible to editors only.',
} as const;

type Props = {
  bounty: BoardBounty;
  /** Editors additionally see the workflow status. */
  showStatus?: boolean;
  /** Distinct interested curators; falls back to bounty.interestedCount. */
  interestedCount?: number;
};

export function BountyInfoCard({ bounty, showStatus = false, interestedCount }: Props) {
  const range = payoutRange(bounty.budget, bounty.difficultyId);
  const deadline = formatDeadline(bounty.deadline);
  const ended = isBountyEnded(bounty.deadline);
  const interested = interestedCount ?? bounty.interestedCount;

  return (
    <section
      aria-label="Bounty details"
      data-testid="bounty-info-card"
      className="grid grid-cols-1 gap-x-8 gap-y-2 rounded-lg border border-grey-02 bg-white p-4 md:grid-cols-2"
    >
      <dl className="flex flex-col gap-2">
        <Field label="Bounty budget" help={BOUNTY_FIELD_HELP.budget}>
          {bounty.budget != null ? (
            <span className="inline-flex items-center gap-1">
              <Gem color="purple" />
              {formatPoints(bounty.budget)}
            </span>
          ) : (
            <Muted>Not set</Muted>
          )}
        </Field>
        <Field label="Payout range" help={BOUNTY_FIELD_HELP.payoutRange}>
          {range ? formatPayoutRange(range) : <Muted>Not set</Muted>}
        </Field>
        {showStatus ? (
          <Field label="Status" help={BOUNTY_FIELD_HELP.status}>
            <Tag>{bounty.status ?? 'Backlog'}</Tag>
          </Field>
        ) : null}
        <Field label="Submission deadline" help={BOUNTY_FIELD_HELP.deadline}>
          {deadline ? (
            <span className={ended ? 'text-red-01' : undefined}>
              {deadline}
              {ended ? ' (ended)' : ''}
            </span>
          ) : (
            <Muted>No deadline</Muted>
          )}
        </Field>
        <Field label="Difficulty">{bounty.difficulty ?? <Muted>Not set</Muted>}</Field>
        <Field label="Skills">
          {bounty.skills.length > 0 ? (
            <span className="flex flex-wrap gap-1">
              {bounty.skills.map(skill => (
                <Link key={skill.id} href={NavUtils.toEntity(bounty.spaceId, skill.id)}>
                  <Tag className="hover:bg-grey-03">{skill.name}</Tag>
                </Link>
              ))}
            </span>
          ) : (
            <Muted>None listed</Muted>
          )}
        </Field>
        <Field label="Space">
          <Link href={NavUtils.toSpace(bounty.spaceId)} className="inline-flex items-center gap-1.5 hover:underline">
            <span className="relative inline-flex size-[16px] shrink-0 overflow-hidden rounded-sm">
              <ThumbGeoImage
                value={bounty.spaceImage ?? PLACEHOLDER_SPACE_IMAGE}
                alt=""
                className="h-full w-full object-cover"
              />
            </span>
            {bounty.spaceLabel ?? bounty.spaceId}
          </Link>
        </Field>
        <Field label="Maintainers">
          {bounty.maintainers.length > 0 ? (
            <span className="flex flex-wrap gap-x-2 gap-y-1">
              {bounty.maintainers.map(person => (
                <Link key={person.id} href={NavUtils.toEntity(bounty.spaceId, person.id)} className="hover:underline">
                  {person.name?.trim() || 'Unnamed maintainer'}
                </Link>
              ))}
            </span>
          ) : (
            <Muted>None listed</Muted>
          )}
        </Field>
      </dl>

      <dl className="max-md:border-t max-md:pt-2 flex flex-col gap-2 border-grey-02 md:border-l md:pl-8">
        <Field label="Max contributors" help={BOUNTY_FIELD_HELP.maxContributors}>
          {bounty.maxContributors != null ? formatPoints(bounty.maxContributors) : 'Unlimited'}
        </Field>
        <Field label="Max submissions per person" help={BOUNTY_FIELD_HELP.maxSubmissionsPerPerson}>
          {bounty.submissionsPerPerson != null ? formatPoints(bounty.submissionsPerPerson) : 'Unlimited'}
        </Field>
        <Field label="Total submissions" help={BOUNTY_FIELD_HELP.submissions}>
          {formatPoints(bounty.submissionsCount ?? 0)}
        </Field>
        <Field label="Interested" help={BOUNTY_FIELD_HELP.interested}>
          {formatPoints(interested)}
        </Field>
        <Field label="Allocated" help={BOUNTY_FIELD_HELP.allocated}>
          {bounty.maxContributors != null
            ? `${formatPoints(bounty.allocatedIds.length)} of ${formatPoints(bounty.maxContributors)}`
            : formatPoints(bounty.allocatedIds.length)}
        </Field>
      </dl>
    </section>
  );
}

export function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-metadata">
      <dt className="flex shrink-0 items-center gap-1 text-grey-04">
        {label}
        {help ? (
          <Tooltip
            trigger={
              <button
                type="button"
                aria-label={`About ${label.toLowerCase()}`}
                className="inline-flex size-3.5 items-center justify-center rounded-full border border-grey-03 text-[9px] leading-none text-grey-04"
              >
                ?
              </button>
            }
            label={help}
          />
        ) : null}
      </dt>
      <dd className="min-w-0 text-right text-text">{children}</dd>
    </div>
  );
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-grey-03">{children}</span>;
}
