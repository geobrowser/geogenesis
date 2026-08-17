'use client';

import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { useRouter } from 'next/navigation';
import Textarea from 'react-textarea-autosize';

import { getSpaceMetrics } from '~/core/bounties/api';
import {
  type BountyFields,
  type EntityPick,
  buildCreateBountyOps,
  buildUpdateBountyOps,
} from '~/core/bounties/bounty-ops';
import { CURATOR_API_BASE_URL } from '~/core/bounties/config';
import {
  DIFFICULTIES,
  type DifficultyKey,
  WORKFLOW_STATUSES,
  type WorkflowStatusKey,
  difficultyKeyForId,
  isDifficultyKey,
  isWorkflowStatusKey,
  statusKeyForId,
} from '~/core/bounties/labels';
import { formatPoints } from '~/core/bounties/payout';
import type { BoardBounty } from '~/core/bounties/types';
import { bountyQueryKeys } from '~/core/bounties/use-bounties';
import { useAccessControl } from '~/core/hooks/use-access-control';
import { useGeoProfile } from '~/core/hooks/use-geo-profile';
import { usePublish } from '~/core/hooks/use-publish';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useToast } from '~/core/hooks/use-toast';
import type { Relation } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { Button, SmallButton } from '~/design-system/button';
import { CheckCloseSmall } from '~/design-system/icons/check-close-small';
import { Select } from '~/design-system/select';
import { SelectEntity } from '~/design-system/select-entity';
import { Text } from '~/design-system/text';

const fieldClass = 'w-full rounded-md border border-grey-02 px-3 py-2 text-metadata';

export type BountyFormInitial = {
  bounty: BoardBounty;
  /** The bounty's current relations (from the API), diffed on save. */
  relations: Relation[];
};

type Props = { mode: 'create'; spaceId: string } | { mode: 'edit'; spaceId: string; initial: BountyFormInitial };

/** `YYYY-MM-DD` for a date input from an ISO datetime, or ''. */
function dateInputValue(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toISOString().slice(0, 10);
}

/** End of the chosen day, UTC, as ISO — deadlines are dates in the form but datetimes on-chain. */
export function deadlineFromDateInput(value: string): string | null {
  if (!value) return null;
  const ms = Date.parse(`${value}T23:59:59.000Z`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function parseOptionalNumber(raw: string): number | null | 'invalid' {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 'invalid';
}

/**
 * Validates form state into publishable fields. Returns the first problem as a
 * message so the form can toast it — imperative validation is the repo norm.
 */
export function validateBountyForm(input: {
  name: string;
  budget: string;
  maxContributors: string;
  maxSubmissionsPerPerson: string;
  deadline: string;
  availableBalance: number | null;
  /** In edit mode the current budget is already reserved and comes back if raised. */
  reservedBudget: number;
}):
  | { ok: true; budget: number | null; maxContributors: number | null; maxSubmissionsPerPerson: number | null }
  | { ok: false; message: string } {
  if (!input.name.trim()) return { ok: false, message: 'Add a bounty name.' };

  const budget = parseOptionalNumber(input.budget);
  if (budget === 'invalid') return { ok: false, message: 'Budget must be a positive number of points.' };
  if (budget != null && input.availableBalance != null && budget - input.reservedBudget > input.availableBalance) {
    return {
      ok: false,
      message: `Budget cannot exceed the space's available points (${formatPoints(input.availableBalance + input.reservedBudget)}).`,
    };
  }

  const maxContributors = parseOptionalNumber(input.maxContributors);
  if (maxContributors === 'invalid' || (maxContributors != null && !Number.isInteger(maxContributors))) {
    return { ok: false, message: 'Max contributors must be a whole number.' };
  }
  const maxSubmissionsPerPerson = parseOptionalNumber(input.maxSubmissionsPerPerson);
  if (
    maxSubmissionsPerPerson === 'invalid' ||
    (maxSubmissionsPerPerson != null && !Number.isInteger(maxSubmissionsPerPerson))
  ) {
    return { ok: false, message: 'Max submissions per person must be a whole number.' };
  }
  if (input.deadline && !deadlineFromDateInput(input.deadline)) {
    return { ok: false, message: 'Deadline is not a valid date.' };
  }

  return { ok: true, budget, maxContributors, maxSubmissionsPerPerson };
}

/** Author or edit a Bounty entity in a DAO space (editors only — the route gates on that). */
export function BountyForm(props: Props) {
  const { spaceId } = props;
  const initial = props.mode === 'edit' ? props.initial : null;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { makeProposal } = usePublish();
  const [, setToast] = useToast();
  const { smartAccount } = useSmartAccount();
  const { profile } = useGeoProfile(smartAccount?.account.address);
  const access = useAccessControl(spaceId);

  const [name, setName] = React.useState(initial?.bounty.name ?? '');
  const [description, setDescription] = React.useState(initial?.bounty.description ?? '');
  const [budget, setBudget] = React.useState(initial?.bounty.budget != null ? String(initial.bounty.budget) : '');
  const [difficulty, setDifficulty] = React.useState<DifficultyKey | ''>(
    difficultyKeyForId(initial?.bounty.difficultyId) ?? ''
  );
  const [status, setStatus] = React.useState<WorkflowStatusKey>(statusKeyForId(initial?.bounty.statusId));
  const [deadline, setDeadline] = React.useState(dateInputValue(initial?.bounty.deadline ?? null));
  const [maxContributors, setMaxContributors] = React.useState(
    initial?.bounty.maxContributors != null ? String(initial.bounty.maxContributors) : ''
  );
  const [maxSubmissionsPerPerson, setMaxSubmissionsPerPerson] = React.useState(
    initial?.bounty.submissionsPerPerson != null ? String(initial.bounty.submissionsPerPerson) : ''
  );
  const [skills, setSkills] = React.useState<EntityPick[]>(initial?.bounty.skills ?? []);
  const [maintainers, setMaintainers] = React.useState<EntityPick[]>(initial?.bounty.maintainers ?? []);
  const [submitting, setSubmitting] = React.useState(false);

  // Available points come from curator-backend (ledger balance minus open bounty
  // budgets). When the backend is unreachable the check is skipped, never blocked:
  // the budget is advisory until allocation/payout, which are the enforced steps.
  const metrics = useQuery({
    queryKey: ['bounties', 'space-metrics', spaceId],
    enabled: !!CURATOR_API_BASE_URL,
    staleTime: 15_000,
    retry: false,
    queryFn: () => getSpaceMetrics(spaceId),
  });
  const availableBalance = metrics.data?.balance ?? null;
  const reservedBudget = initial?.bounty.budget ?? 0;

  const isEasy = difficulty === 'easy';
  const backHref = initial ? NavUtils.toBounty(spaceId, initial.bounty.id) : NavUtils.toSpaceBounties(spaceId);

  const onSubmit = async () => {
    const validation = validateBountyForm({
      name,
      budget,
      maxContributors,
      maxSubmissionsPerPerson,
      deadline,
      availableBalance,
      reservedBudget,
    });
    if (!validation.ok) return setToast(<>{validation.message}</>);

    const fields: BountyFields = {
      spaceId,
      name: name.trim(),
      description,
      budget: validation.budget,
      difficulty: difficulty || null,
      status,
      deadline: deadlineFromDateInput(deadline),
      maxContributors: validation.maxContributors,
      maxSubmissionsPerPerson: validation.maxSubmissionsPerPerson,
      skills,
      maintainers,
    };

    setSubmitting(true);
    const invalidate = () => queryClient.invalidateQueries({ queryKey: bountyQueryKeys.all });

    if (initial) {
      const { values, relations } = buildUpdateBountyOps(initial.bounty.id, fields, initial.relations);
      await makeProposal({
        values,
        relations,
        spaceId,
        name: `Update bounty: ${fields.name}`,
        onSuccess: async () => {
          await invalidate();
          router.push(NavUtils.toBounty(spaceId, initial.bounty.id));
        },
        onError: () => setSubmitting(false),
      });
      return;
    }

    const creator: EntityPick | null =
      profile?.id && profile.id !== profile.spaceId && !profile.id.startsWith('0x')
        ? { id: profile.id, name: profile.name }
        : null;
    const { entityId, values, relations } = buildCreateBountyOps(fields, creator);
    await makeProposal({
      values,
      relations,
      spaceId,
      name: `Create bounty: ${fields.name}`,
      onSuccess: async () => {
        await invalidate();
        router.push(NavUtils.toBounty(spaceId, entityId));
      },
      onError: () => setSubmitting(false),
    });
  };

  // Only editors of the DAO space may author bounties: a member's proposal would
  // stall on the FAST path awaiting an editor vote, so refuse up front instead.
  if (!access.isLoading && !access.isEditor) {
    return (
      <div className="mx-auto flex max-w-[820px] flex-col gap-3 px-4 py-8" data-testid="bounty-form-denied">
        <Text as="h1" variant="largeTitle">
          {initial ? 'Edit bounty' : 'New bounty'}
        </Text>
        <Text as="p" color="grey-04">
          Only editors of this space can {initial ? 'edit' : 'create'} bounties.
        </Text>
        <div>
          <Button variant="secondary" onClick={() => router.push(backHref)}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-5 px-4 py-8" data-testid="bounty-form">
      <Text as="h1" variant="largeTitle">
        {initial ? 'Edit bounty' : 'New bounty'}
      </Text>

      <label className="flex flex-col gap-1">
        <Text variant="metadataMedium">Name</Text>
        <Textarea
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="What needs curating?"
          className={`${fieldClass} resize-none text-smallTitle`}
          minRows={1}
          maxRows={3}
          autoFocus={!initial}
        />
      </label>

      <label className="flex flex-col gap-1">
        <Text variant="metadataMedium">Description</Text>
        <Textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="A short summary shown on the board. Write the full brief in the page body after saving."
          className={`${fieldClass} resize-none`}
          minRows={2}
          maxRows={8}
        />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <Text variant="metadataMedium">Difficulty</Text>
          <Select
            value={difficulty}
            onChange={value => setDifficulty(isDifficultyKey(value) ? value : '')}
            options={[{ value: '', label: 'Not set' }, ...DIFFICULTIES.map(d => ({ value: d.key, label: d.label }))]}
          />
        </label>
        <label className="flex flex-col gap-1">
          <Text variant="metadataMedium">Workflow status</Text>
          <Select
            value={status}
            onChange={value => setStatus(isWorkflowStatusKey(value) ? value : 'backlog')}
            options={WORKFLOW_STATUSES.map(s => ({ value: s.key, label: s.label }))}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <Text variant="metadataMedium">Budget (points)</Text>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={budget}
            onChange={e => setBudget(e.target.value)}
            placeholder={isEasy ? 'Paid in full per submission' : 'Total for all contributors'}
            className={fieldClass}
          />
          <Text variant="footnote" color="grey-04">
            {availableBalance != null
              ? `${formatPoints(availableBalance + reservedBudget)} points available in this space.`
              : metrics.isError
                ? 'Available points unavailable right now — the budget will be checked at payout.'
                : ' '}
          </Text>
        </label>
        <label className="flex flex-col gap-1">
          <Text variant="metadataMedium">Submission deadline</Text>
          <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className={fieldClass} />
        </label>
      </div>

      {!isEasy ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <Text variant="metadataMedium">Max contributors</Text>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={maxContributors}
              onChange={e => setMaxContributors(e.target.value)}
              placeholder="Unlimited"
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <Text variant="metadataMedium">Max submissions per person</Text>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={maxSubmissionsPerPerson}
              onChange={e => setMaxSubmissionsPerPerson(e.target.value)}
              placeholder="Unlimited"
              className={fieldClass}
            />
          </label>
        </div>
      ) : null}

      <PickList
        label="Skills"
        picks={skills}
        onChange={setSkills}
        spaceId={spaceId}
        relationValueTypes={[{ id: ContentIds.SKILL_TYPE, name: 'Skill' }]}
        placeholder="Add a skill…"
      />
      <PickList
        label="Maintainers"
        picks={maintainers}
        onChange={setMaintainers}
        spaceId={spaceId}
        relationValueTypes={[{ id: SystemIds.PERSON_TYPE, name: 'Person' }]}
        placeholder="Add a maintainer…"
      />

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={() => router.push(backHref)}>
          Cancel
        </Button>
        <Button variant="primary" disabled={submitting} onClick={onSubmit}>
          {submitting ? (initial ? 'Saving…' : 'Publishing…') : initial ? 'Save' : 'Publish bounty'}
        </Button>
      </div>
    </div>
  );
}

function PickList({
  label,
  picks,
  onChange,
  spaceId,
  relationValueTypes,
  placeholder,
}: {
  label: string;
  picks: EntityPick[];
  onChange: (next: EntityPick[]) => void;
  spaceId: string;
  relationValueTypes: { id: string; name: string | null }[];
  placeholder: string;
}) {
  const [adding, setAdding] = React.useState(false);
  return (
    <div className="flex flex-col gap-1">
      <Text variant="metadataMedium">{label}</Text>
      <div className="flex flex-wrap items-center gap-2">
        {picks.map(pick => (
          <span
            key={pick.id}
            className="inline-flex items-center gap-1 rounded-sm bg-grey-02 px-1.5 py-0.5 text-metadata text-text"
          >
            {pick.name?.trim() || 'Untitled'}
            <button
              type="button"
              aria-label={`Remove ${pick.name ?? 'item'}`}
              onClick={() => onChange(picks.filter(p => p.id !== pick.id))}
              className="text-grey-04 hover:text-text"
            >
              <CheckCloseSmall />
            </button>
          </span>
        ))}
        {adding ? (
          <div className="min-w-[240px]">
            <SelectEntity
              spaceId={spaceId}
              relationValueTypes={relationValueTypes}
              placeholder={placeholder}
              autoFocus
              variant="fixed"
              width="full"
              onDone={result => {
                if (!picks.some(p => p.id === result.id)) onChange([...picks, { id: result.id, name: result.name }]);
                setAdding(false);
              }}
            />
          </div>
        ) : (
          <SmallButton onClick={() => setAdding(true)}>Add</SmallButton>
        )}
      </div>
    </div>
  );
}
