'use client';

import * as React from 'react';

import { deadlineFromDateInput } from '~/core/bounties/date-input';
import {
  DIFFICULTIES,
  WORKFLOW_STATUSES,
  difficultyIdForKey,
  difficultyKeyForId,
  isDifficultyKey,
  isWorkflowStatusKey,
  statusIdForKey,
  statusKeyForId,
} from '~/core/bounties/labels';
import {
  BOUNTY_BUDGET_PROPERTY_ID,
  BOUNTY_DEADLINE_PROPERTY_ID,
  BOUNTY_DIFFICULTY_PROPERTY_ID,
  BOUNTY_MAINTAINER_PROPERTY_ID,
  BOUNTY_MAX_CONTRIBUTORS_PROPERTY_ID,
  BOUNTY_MAX_SUBMISSIONS_PER_PERSON_PROPERTY_ID,
  BOUNTY_SKILLS_PROPERTY_ID,
  BOUNTY_TASK_STATUS_PROPERTY_ID,
} from '~/core/bounties/ontology';
import { formatPayoutRange, formatPoints, payoutRange } from '~/core/bounties/payout';
import type { BoardBounty } from '~/core/bounties/types';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useEntity } from '~/core/database/entities';
import { createEntityId, createValueId } from '~/core/id/create-id';
import { uuidToHex } from '~/core/id/normalize';
import { useMutate } from '~/core/sync/use-mutate';
import type { DataType, Relation, Value } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { DateField } from '~/design-system/editable-fields/date-field';
import { NumberField } from '~/design-system/editable-fields/number-field';
import { ThumbGeoImage } from '~/design-system/geo-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Select } from '~/design-system/select';
import { Skeleton } from '~/design-system/skeleton';

import { RelationsGroup } from '~/partials/entity-page/editable-entity-page';

import { BOUNTY_FIELD_HELP, Field, Muted } from './bounty-info-card';

type Props = {
  bounty: BoardBounty;
};

/**
 * The bounty facts card in edit mode. Same rows, same order as the read-only
 * card, so switching modes never reshuffles anything; the editable rows use
 * the SAME editors the regular properties container uses (NumberField,
 * DateField, RelationsGroup) and the two closed-set relations (status,
 * difficulty) use a dropdown. Everything writes into the local-first store,
 * so the page's normal review-and-publish flow picks the changes up.
 */
export function EditableBountyInfoCard({ bounty }: Props) {
  const spaceId = bounty.spaceId;
  const entity = useEntity({ id: bounty.id, spaceId });
  const { storage } = useMutate();

  const entityRef = { id: bounty.id, name: entity.name ?? bounty.name };

  const relationsOf = React.useCallback(
    (typeId: string): Relation[] =>
      entity.relations.filter(
        r => r.type.id === typeId && uuidToHex(r.fromEntity.id) === uuidToHex(bounty.id) && !r.isDeleted
      ),
    [bounty.id, entity.relations]
  );

  const valueOf = (propertyId: string): string | null =>
    entity.values.find(v => v.property.id === propertyId && !v.isDeleted)?.value ?? null;

  const buildValue = (propertyId: string, propertyName: string, dataType: DataType, value: string): Value => ({
    id: createValueId({ entityId: bounty.id, propertyId, spaceId }),
    entity: entityRef,
    property: { id: propertyId, name: propertyName, dataType },
    value,
    spaceId,
    isLocal: true,
  });

  /** Empty input unsets the property; anything else upserts it (deterministic value id). */
  const commitValue = (propertyId: string, propertyName: string, dataType: DataType, raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      storage.values.delete(buildValue(propertyId, propertyName, dataType, ''));
      return;
    }
    storage.values.set(buildValue(propertyId, propertyName, dataType, trimmed));
  };

  /** Invalid intermediate input (e.g. "1.", "-3") is left alone — the field keeps its own text meanwhile. */
  const commitNumber = (propertyId: string, propertyName: string, raw: string, integer = false) => {
    const trimmed = raw.trim();
    if (trimmed) {
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isInteger(parsed))) return;
    }
    commitValue(propertyId, propertyName, 'FLOAT', trimmed);
  };

  const buildRelation = (typeId: string, typeName: string, to: { id: string; name: string | null }): Relation => ({
    id: createEntityId(),
    entityId: createEntityId(),
    spaceId,
    renderableType: 'RELATION',
    fromEntity: entityRef,
    toEntity: { id: to.id, name: to.name, value: to.id },
    type: { id: typeId, name: typeName },
    isLocal: true,
  });

  /** Single-valued relation (status, difficulty): tombstone what is there, then add the pick. */
  const replaceRelation = (typeId: string, typeName: string, next: { id: string; name: string | null } | null) => {
    const current = relationsOf(typeId);
    if (next && current.length === 1 && uuidToHex(current[0].toEntity.id) === uuidToHex(next.id)) return;
    storage.relations.deleteMany(current);
    if (next) storage.relations.set(buildRelation(typeId, typeName, next));
  };

  const budget = valueOf(BOUNTY_BUDGET_PROPERTY_ID);
  const maxContributors = valueOf(BOUNTY_MAX_CONTRIBUTORS_PROPERTY_ID);
  const maxSubmissions = valueOf(BOUNTY_MAX_SUBMISSIONS_PER_PERSON_PROPERTY_ID);
  const deadlineIso = valueOf(BOUNTY_DEADLINE_PROPERTY_ID);
  const statusKey = statusKeyForId(relationsOf(BOUNTY_TASK_STATUS_PROPERTY_ID)[0]?.toEntity.id ?? null);
  const difficultyId = relationsOf(BOUNTY_DIFFICULTY_PROPERTY_ID)[0]?.toEntity.id ?? null;
  const difficultyKey = difficultyKeyForId(difficultyId);

  // Derived, read-only rows use the LIVE values so they follow edits immediately.
  const budgetNumber = budget != null && Number.isFinite(Number(budget)) ? Number(budget) : null;
  const range = payoutRange(budgetNumber, difficultyId);

  // The store hydrates the entity asynchronously. Until it has, the editors
  // would render blank and a stray blur on a falsely-blank field would queue
  // an unset for a value the user never saw — so don't render editors before
  // the data is there.
  if (entity.isLoading) {
    return (
      <section
        aria-label="Edit bounty details"
        aria-busy
        className="flex flex-col gap-3 rounded-lg border border-grey-02 bg-white p-4"
      >
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-6 w-full rounded" />
        ))}
      </section>
    );
  }

  return (
    <section
      aria-label="Edit bounty details"
      data-testid="bounty-info-card-editable"
      className="grid grid-cols-1 gap-x-8 gap-y-2 rounded-lg border border-grey-02 bg-white p-4 md:grid-cols-2"
    >
      <dl className="flex flex-col gap-2">
        <Field label="Bounty budget" help={BOUNTY_FIELD_HELP.budget}>
          <NumberField
            isEditing
            value={budget ?? ''}
            placeholder="Not set"
            dataType="FLOAT"
            onChange={v => commitNumber(BOUNTY_BUDGET_PROPERTY_ID, 'Bounty Budget', v)}
          />
        </Field>
        <Field label="Payout range" help={BOUNTY_FIELD_HELP.payoutRange}>
          {range ? formatPayoutRange(range) : <Muted>Not set</Muted>}
        </Field>
        <Field label="Status" help={BOUNTY_FIELD_HELP.status}>
          <Select
            value={statusKey}
            onChange={next => {
              if (!isWorkflowStatusKey(next)) return;
              const pick = WORKFLOW_STATUSES.find(s => s.key === next)!;
              replaceRelation(BOUNTY_TASK_STATUS_PROPERTY_ID, 'Workflow Status', {
                id: statusIdForKey(next),
                name: pick.label,
              });
            }}
            options={WORKFLOW_STATUSES.map(s => ({ value: s.key, label: s.label }))}
          />
        </Field>
        <Field label="Submission deadline" help={BOUNTY_FIELD_HELP.deadline}>
          <DateField
            isEditing
            value={deadlineIso ?? ''}
            propertyId={BOUNTY_DEADLINE_PROPERTY_ID}
            dataType="DATETIME"
            onBlur={({ value }) => {
              // DateField hands back a date string; store the end of that day like the create form does.
              const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? deadlineFromDateInput(value) : value;
              commitValue(BOUNTY_DEADLINE_PROPERTY_ID, 'Submission Deadline', 'DATETIME', iso ?? '');
            }}
          />
        </Field>
        <Field label="Difficulty">
          <Select
            value={difficultyKey ?? ''}
            placeholder="Not set"
            onChange={next => {
              if (next === '') return replaceRelation(BOUNTY_DIFFICULTY_PROPERTY_ID, 'Difficulty', null);
              if (!isDifficultyKey(next)) return;
              const pick = DIFFICULTIES.find(d => d.key === next)!;
              replaceRelation(BOUNTY_DIFFICULTY_PROPERTY_ID, 'Difficulty', {
                id: difficultyIdForKey(next),
                name: pick.label,
              });
            }}
            options={[{ value: '', label: 'Not set' }, ...DIFFICULTIES.map(d => ({ value: d.key, label: d.label }))]}
          />
        </Field>
        <Field label="Skills">
          <RelationsGroup propertyId={BOUNTY_SKILLS_PROPERTY_ID} id={bounty.id} spaceId={spaceId} />
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
          <RelationsGroup propertyId={BOUNTY_MAINTAINER_PROPERTY_ID} id={bounty.id} spaceId={spaceId} />
        </Field>
      </dl>

      <dl className="max-md:border-t max-md:pt-2 flex flex-col gap-2 border-grey-02 md:border-l md:pl-8">
        <Field label="Max contributors" help={BOUNTY_FIELD_HELP.maxContributors}>
          <NumberField
            isEditing
            value={maxContributors ?? ''}
            placeholder="Unlimited"
            dataType="FLOAT"
            onChange={v => commitNumber(BOUNTY_MAX_CONTRIBUTORS_PROPERTY_ID, 'Max Contributors', v, true)}
          />
        </Field>
        <Field label="Max submissions per person" help={BOUNTY_FIELD_HELP.maxSubmissionsPerPerson}>
          <NumberField
            isEditing
            value={maxSubmissions ?? ''}
            placeholder="Unlimited"
            dataType="FLOAT"
            onChange={v =>
              commitNumber(BOUNTY_MAX_SUBMISSIONS_PER_PERSON_PROPERTY_ID, 'Max Submissions Per Person', v, true)
            }
          />
        </Field>
        <Field label="Total submissions" help={BOUNTY_FIELD_HELP.submissions}>
          {formatPoints(bounty.submissionsCount ?? 0)}
        </Field>
        <Field label="Interested" help={BOUNTY_FIELD_HELP.interested}>
          {formatPoints(bounty.interestedCount)}
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
