'use client';

import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

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
import type { BoardBounty } from '~/core/bounties/types';
import { useEntity } from '~/core/database/entities';
import { createEntityId, createValueId } from '~/core/id/create-id';
import { uuidToHex } from '~/core/id/normalize';
import { useMutate } from '~/core/sync/use-mutate';
import type { DataType, Relation, Value } from '~/core/types';

import { SmallButton } from '~/design-system/button';
import { CheckCloseSmall } from '~/design-system/icons/check-close-small';
import { Select } from '~/design-system/select';
import { SelectEntity } from '~/design-system/select-entity';
import { Text } from '~/design-system/text';

import { BOUNTY_FIELD_HELP, Field } from './bounty-info-card';

const inputClass = 'w-full max-w-[220px] rounded-md border border-grey-02 px-2 py-1 text-right text-metadata';

type Props = {
  bounty: BoardBounty;
};

/**
 * The bounty facts card in edit mode. Every field writes straight into the
 * local-first store (the same path as the regular property sheet), so the
 * entity page's normal review-and-publish flow picks the changes up — there is
 * no separate save button or edit route. Name, description, and the brief are
 * edited on the page itself.
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

  const addRelation = (typeId: string, typeName: string, to: { id: string; name: string | null }) => {
    if (relationsOf(typeId).some(r => uuidToHex(r.toEntity.id) === uuidToHex(to.id))) return;
    storage.relations.set(buildRelation(typeId, typeName, to));
  };

  const removeRelation = (typeId: string, toId: string) => {
    storage.relations.deleteMany(relationsOf(typeId).filter(r => uuidToHex(r.toEntity.id) === uuidToHex(toId)));
  };

  const budget = valueOf(BOUNTY_BUDGET_PROPERTY_ID);
  const maxContributors = valueOf(BOUNTY_MAX_CONTRIBUTORS_PROPERTY_ID);
  const maxSubmissions = valueOf(BOUNTY_MAX_SUBMISSIONS_PER_PERSON_PROPERTY_ID);
  const deadlineIso = valueOf(BOUNTY_DEADLINE_PROPERTY_ID);
  const statusKey = statusKeyForId(relationsOf(BOUNTY_TASK_STATUS_PROPERTY_ID)[0]?.toEntity.id ?? null);
  const difficultyKey = difficultyKeyForId(relationsOf(BOUNTY_DIFFICULTY_PROPERTY_ID)[0]?.toEntity.id ?? null);
  const skills = relationsOf(BOUNTY_SKILLS_PROPERTY_ID).map(r => ({ id: r.toEntity.id, name: r.toEntity.name }));
  const maintainers = relationsOf(BOUNTY_MAINTAINER_PROPERTY_ID).map(r => ({
    id: r.toEntity.id,
    name: r.toEntity.name,
  }));

  const deadlineInput = deadlineIso ? new Date(deadlineIso).toISOString().slice(0, 10) : '';

  return (
    <section
      aria-label="Edit bounty details"
      data-testid="bounty-info-card-editable"
      className="flex flex-col gap-4 rounded-lg border border-grey-02 bg-white p-4"
    >
      <div className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
        <dl className="flex flex-col gap-3">
          <Field label="Bounty budget" help={BOUNTY_FIELD_HELP.budget}>
            <input
              type="number"
              min={0}
              aria-label="Bounty budget"
              defaultValue={budget ?? ''}
              onBlur={e => commitNumber(BOUNTY_BUDGET_PROPERTY_ID, 'Bounty Budget', e.target.value)}
              className={inputClass}
            />
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
            <input
              type="date"
              aria-label="Submission deadline"
              defaultValue={deadlineInput}
              onChange={e => {
                const iso = deadlineFromDateInput(e.target.value);
                commitValue(BOUNTY_DEADLINE_PROPERTY_ID, 'Submission Deadline', 'DATETIME', iso ?? '');
              }}
              className={inputClass}
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
        </dl>

        <dl className="max-md:border-t max-md:pt-3 flex flex-col gap-3 border-grey-02 md:border-l md:pl-8">
          <Field label="Max contributors" help={BOUNTY_FIELD_HELP.maxContributors}>
            <input
              type="number"
              min={0}
              step={1}
              aria-label="Max contributors"
              defaultValue={maxContributors ?? ''}
              onBlur={e => commitNumber(BOUNTY_MAX_CONTRIBUTORS_PROPERTY_ID, 'Max Contributors', e.target.value, true)}
              className={inputClass}
            />
          </Field>
          <Field label="Max submissions per person" help={BOUNTY_FIELD_HELP.maxSubmissionsPerPerson}>
            <input
              type="number"
              min={0}
              step={1}
              aria-label="Max submissions per person"
              defaultValue={maxSubmissions ?? ''}
              onBlur={e =>
                commitNumber(
                  BOUNTY_MAX_SUBMISSIONS_PER_PERSON_PROPERTY_ID,
                  'Max Submissions Per Person',
                  e.target.value,
                  true
                )
              }
              className={inputClass}
            />
          </Field>
        </dl>
      </div>

      <EditablePickRow
        label="Skills"
        picks={skills}
        spaceId={spaceId}
        relationValueTypes={[{ id: ContentIds.SKILL_TYPE, name: 'Skill' }]}
        placeholder="Add a skill…"
        onAdd={pick => addRelation(BOUNTY_SKILLS_PROPERTY_ID, 'Skills', pick)}
        onRemove={id => removeRelation(BOUNTY_SKILLS_PROPERTY_ID, id)}
      />
      <EditablePickRow
        label="Maintainers"
        picks={maintainers}
        spaceId={spaceId}
        relationValueTypes={[{ id: SystemIds.PERSON_TYPE, name: 'Person' }]}
        placeholder="Add a maintainer…"
        onAdd={pick => addRelation(BOUNTY_MAINTAINER_PROPERTY_ID, 'Maintainer', pick)}
        onRemove={id => removeRelation(BOUNTY_MAINTAINER_PROPERTY_ID, id)}
      />

      <Text variant="footnote" color="grey-04">
        Name, description, and the brief are edited directly on the page. Changes here publish with the page&apos;s
        normal review flow.
      </Text>
    </section>
  );
}

function EditablePickRow({
  label,
  picks,
  spaceId,
  relationValueTypes,
  placeholder,
  onAdd,
  onRemove,
}: {
  label: string;
  picks: { id: string; name: string | null }[];
  spaceId: string;
  relationValueTypes: { id: string; name: string | null }[];
  placeholder: string;
  onAdd: (pick: { id: string; name: string | null }) => void;
  onRemove: (id: string) => void;
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
              onClick={() => onRemove(pick.id)}
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
                onAdd({ id: result.id, name: result.name });
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
