import { SystemIds } from '@graphprotocol/grc-20';
import Link from 'next/link';

import { editEvent } from '~/core/events/edit-events';
import { PropertyId } from '~/core/hooks/use-properties';
import { Cell, PropertySchema } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { CheckCircle } from '~/design-system/icons/check-circle';
import { PageStringField } from '~/design-system/editable-fields/editable-fields';
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
};

export function TableBlockBulletedListItem({
  columns,
  currentSpaceId,
  isEditing,
  rowEntityId,
  isPlaceholder,
  onChangeEntry,
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

  if (isEditing) {
    return (
      <div className="group flex w-full items-center gap-2 py-0.5 px-1">
        <div className="flex-shrink-0 text-xl leading-none text-text">•</div>
        <div className="w-full">
          {isPlaceholder ? (
            <SelectEntity
              onCreateEntity={result => {
                onChangeEntry(
                  {
                    entityId: rowEntityId,
                    entityName: result.name,
                    spaceId: currentSpaceId,
                  },
                  {
                    type: 'FOC',
                    data: result,
                  }
                );
              }}
              spaceId={currentSpaceId}
              allowedTypes={[]}
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
      className="group flex w-full items-center gap-2 rounded-md py-0.5 px-1 transition duration-200 hover:bg-divider"
    >
      <div className="flex-shrink-0 text-xl leading-none text-text">•</div>
      <div className="flex items-center gap-2">
        {verified && (
          <div>
            <CheckCircle />
          </div>
        )}
        <div className="line-clamp-1 text-body font-medium text-text">{name}</div>
      </div>
    </Link>
  );
}
