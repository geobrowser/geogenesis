import { SystemIds } from '@graphprotocol/grc-20';
import Link from 'next/link';

import { Source } from '~/core/blocks/data/source';
import { PropertyId } from '~/core/hooks/use-properties';
import { Cell, PropertySchema } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { PageStringField } from '~/design-system/editable-fields/editable-fields';
import { CheckCircle } from '~/design-system/icons/check-circle';
import { SelectEntity } from '~/design-system/select-entity';

import { onChangeEntryFn } from './change-entry';

type Props = {
  columns: Record<string, Cell>;
  currentSpaceId: string;
  isEditing: boolean;
  rowEntityId: string;
  isPlaceholder: boolean;
  onChangeEntry: onChangeEntryFn;
  properties?: Record<PropertyId, PropertySchema>;
  source: Source;
};

export function TableBlockBulletedListItem({
  columns,
  currentSpaceId,
  isEditing,
  rowEntityId,
  isPlaceholder,
  onChangeEntry,
  source,
}: Props) {
  const nameCell = columns[SystemIds.NAME_ATTRIBUTE];
  const { cellId, verified } = nameCell;
  let { name } = nameCell;

  const maybeNameInSpaceRenderable = nameCell.renderables.find(
    r => r.attributeId === SystemIds.NAME_ATTRIBUTE && r.spaceId === currentSpaceId
  );

  let maybeNameInSpace = maybeNameInSpaceRenderable?.value;

  if (maybeNameInSpaceRenderable?.type === 'RELATION') {
    maybeNameInSpace = maybeNameInSpaceRenderable?.valueName ?? maybeNameInSpace;
  }

  const maybeNameRenderable = nameCell?.renderables.find(r => r.attributeId === SystemIds.NAME_ATTRIBUTE);

  let maybeOtherName = maybeNameRenderable?.value;

  if (maybeNameRenderable?.type === 'RELATION') {
    maybeOtherName = maybeNameRenderable?.valueName ?? maybeNameInSpace;
  }

  const maybeName = maybeNameInSpace ?? maybeOtherName;

  if (maybeName) {
    name = maybeOtherName ?? null;
  }

  const href = NavUtils.toEntity(nameCell?.space ?? currentSpaceId, cellId);

  if (isEditing && source.type !== 'RELATIONS') {
    return (
      <div className="group flex w-full gap-2 px-1 py-0.5">
        <div className="mt-1 flex-shrink-0 text-xl leading-none text-text">•</div>
        <div className="w-full">
          {isPlaceholder && source.type === 'COLLECTION' ? (
            <SelectEntity
              onCreateEntity={result => {
                onChangeEntry(
                  {
                    entityId: rowEntityId,
                    entityName: result.name,
                    spaceId: currentSpaceId,
                  },
                  {
                    type: 'Create',
                    data: result,
                  }
                );
              }}
              onDone={(result, fromCreateFn) => {
                if (fromCreateFn) {
                  // We bail out in the case that we're receiving the onDone
                  // callback from within the create entity function internal
                  // to SelectEntity.
                  return;
                }

                // This actually works quite differently than other creates since
                // we want to use the existing placeholder entity id.
                onChangeEntry(
                  {
                    entityId: rowEntityId,
                    entityName: result.name,
                    spaceId: currentSpaceId,
                  },
                  {
                    type: 'Find',
                    data: result,
                  }
                );
              }}
              spaceId={currentSpaceId}
            />
          ) : (
            <div className="flex items-center gap-2">
              {verified && (
                <span>
                  <CheckCircle color={isEditing ? 'text' : 'ctaPrimary'} />
                </span>
              )}
              <PageStringField
                placeholder="Add name..."
                onChange={value => {
                  onChangeEntry(
                    {
                      entityId: rowEntityId,
                      entityName: name,
                      spaceId: currentSpaceId,
                    },
                    {
                      type: 'EVENT',
                      data: {
                        type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
                        payload: {
                          renderable: {
                            attributeId: SystemIds.NAME_ATTRIBUTE,
                            entityId: rowEntityId,
                            spaceId: currentSpaceId,
                            attributeName: 'Name',
                            entityName: name,
                            type: 'TEXT',
                            value: name ?? '',
                          },
                          value: { type: 'TEXT', value: value },
                        },
                      },
                    }
                  );
                }}
                value={name ?? ''}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="group relative flex w-full gap-2 rounded-md px-1 py-0.5 transition duration-200 hover:bg-divider"
    >
      <div className="mt-1 flex-shrink-0 text-xl leading-none text-text">•</div>
      <div className="flex items-center gap-2">
        {verified && (
          <div>
            <CheckCircle />
          </div>
        )}
        <div className="text-body text-text">{name}</div>
      </div>
    </Link>
  );
}
