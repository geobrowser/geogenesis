import { SYSTEM_IDS } from '@geogenesis/ids';
import { cva } from 'class-variance-authority';
import cx from 'classnames';
import { diffArrays, diffWords } from 'diff';
import type { Change as Difference } from 'diff';

import * as React from 'react';

import { AttributeChange, AttributeId } from '~/core/utils/change/change';
import { getImagePath } from '~/core/utils/utils';

import { DateTimeDiff } from '../review';
import { EntityId } from './types';

type ChangedAttributeProps = {
  attributeId: AttributeId;
  attribute: AttributeChange;
  entityId: EntityId;
};

export const ChangedAttribute = ({ attributeId, attribute }: ChangedAttributeProps) => {
  // Don't show page blocks
  if (attributeId === SYSTEM_IDS.BLOCKS) return <></>;

  const { name, before, after } = attribute;

  // Don't show dead changes
  if (!before && !after) return <></>;

  // Don't show unchanged attributes
  if (JSON.stringify(before) === JSON.stringify(after)) return <></>;

  switch (attribute.type) {
    case 'string': {
      const checkedBefore = typeof before === 'string' ? before : '';
      const checkedAfter = typeof after === 'string' ? after : '';
      const differences = diffWords(checkedBefore, checkedAfter);

      return (
        <div key={attributeId} className="-mt-px flex gap-8">
          <div className="flex-1 border border-grey-02 p-4">
            <div className="text-bodySemibold capitalize">{name}</div>
            <div className="text-body">
              {differences
                .filter(item => !item.added)
                .map((difference: Difference, index: number) => (
                  <span key={index} className={cx(difference.removed && 'bg-errorTertiary line-through')}>
                    {difference.value}
                  </span>
                ))}
            </div>
          </div>
          <div className="group relative flex-1 border border-grey-02 p-4">
            <div className="text-bodySemibold capitalize">{name}</div>
            <div className="text-body">
              {differences
                .filter(item => !item.removed)
                .map((difference: Difference, index: number) => (
                  <span key={index} className={cx(difference.added && 'bg-successTertiary')}>
                    {difference.value}
                  </span>
                ))}
            </div>
          </div>
        </div>
      );
    }
    case 'entity': {
      if (!Array.isArray(before) || !Array.isArray(after)) return <></>;

      const diffs = diffArrays(before, after);

      return (
        <div key={attributeId} className="-mt-px flex gap-8">
          <div className="flex-1 border border-grey-02 p-4">
            <div className="text-bodySemibold capitalize">{name}</div>
            <div className="flex flex-wrap gap-2">
              {diffs
                .filter(items => !items.added)
                .map(items => {
                  return (
                    <>
                      {items.value.map(item => (
                        <Chip key={item} status={items.removed ? 'removed' : 'unchanged'}>
                          {item}
                        </Chip>
                      ))}
                    </>
                  );
                })}
            </div>
          </div>
          <div className="group relative flex-1 border border-grey-02 p-4">
            <div className="text-bodySemibold capitalize">{name}</div>
            <div className="flex flex-wrap gap-2">
              {diffs
                .filter(items => !items.removed)
                .map(items => {
                  return (
                    <>
                      {items.value.map(item => (
                        <Chip key={item} status={items.added ? 'added' : 'unchanged'}>
                          {item}
                        </Chip>
                      ))}
                    </>
                  );
                })}
            </div>
          </div>
        </div>
      );
    }
    case 'image': {
      return (
        <div key={attributeId} className="-mt-px flex gap-8">
          <div className="flex-1 border border-grey-02 p-4">
            <div className="text-bodySemibold capitalize">{name}</div>
            <div>
              {/* @TODO: When can this be object? */}
              {typeof before !== 'object' && (
                <span className="inline-block rounded bg-errorTertiary p-1">
                  <img src={getImagePath(before)} className="rounded" />
                </span>
              )}
            </div>
          </div>
          <div className="group relative flex-1 border border-grey-02 p-4">
            <div className="text-bodySemibold capitalize">{name}</div>
            <div>
              {/* @TODO: When can this be object? */}
              {typeof after !== 'object' && (
                <span className="inline-block rounded bg-successTertiary p-1">
                  <img src={getImagePath(after)} className="rounded" />
                </span>
              )}
            </div>
          </div>
        </div>
      );
    }
    case 'date': {
      return (
        <div key={attributeId} className="-mt-px flex gap-8">
          <div className="flex-1 border border-grey-02 p-4">
            <div className="text-bodySemibold capitalize">{name}</div>
            <div className="text-body">
              {before && <DateTimeDiff mode="before" before={before as string | null} after={after as string | null} />}
            </div>
          </div>
          <div className="flex-1 border border-grey-02 p-4">
            <div className="text-bodySemibold capitalize">{name}</div>
            <div className="text-body">
              {after && <DateTimeDiff mode="after" before={before as string | null} after={after as string | null} />}
            </div>
          </div>
        </div>
      );
    }
    case 'url': {
      const checkedBefore = typeof before === 'string' ? before : '';
      const checkedAfter = typeof after === 'string' ? after : '';
      const differences = diffWords(checkedBefore, checkedAfter);

      return (
        <div key={attributeId} className="-mt-px flex gap-8">
          <div className="flex-1 border border-grey-02 p-4">
            <div className="text-bodySemibold capitalize">{name}</div>
            <div className="truncate text-ctaPrimary no-underline">
              {differences
                .filter(item => !item.added)
                .map((difference: Difference, index: number) => (
                  <span key={index} className={cx(difference.removed && 'bg-errorTertiary line-through')}>
                    {difference.value}
                  </span>
                ))}
            </div>
          </div>
          <div className="group relative flex-1 border border-grey-02 p-4">
            <div className="text-bodySemibold capitalize">{name}</div>
            <div className="truncate text-ctaPrimary no-underline">
              {differences
                .filter(item => !item.removed)
                .map((difference: Difference, index: number) => (
                  <span key={index} className={cx(difference.added && 'bg-successTertiary')}>
                    {difference.value}
                  </span>
                ))}
            </div>
          </div>
        </div>
      );
    }
    default: {
      // required for <ChangedAttribute /> to be valid JSX
      return <React.Fragment />;
    }
  }
};

type ChipProps = {
  status?: 'added' | 'removed' | 'unchanged';
  children: React.ReactNode;
};

const chip = cva(
  'inline-flex min-h-[1.5rem] items-center rounded-sm px-2 py-1 text-left text-metadataMedium shadow-inner shadow-text',
  {
    variants: {
      status: {
        added: 'bg-successTertiary',
        removed: 'bg-errorTertiary line-through',
        unchanged: 'bg-white',
      },
    },
  }
);

const Chip = ({ status = 'unchanged', children }: ChipProps) => {
  return <span className={chip({ status })}>{children}</span>;
};
