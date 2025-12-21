'use client';

import * as React from 'react';
import { cva } from 'class-variance-authority';

import { useName } from '~/core/state/entity-page-store/entity-store';

interface Props {
  relationId: string;
  relationName?: string;
  spaceId: string;
  relationSpaceId?: string;
  onClick: (entityId: string, entitySpaceId?: string) => void;
  verified?: boolean;
}

const chipStyles = cva(
  'inline-flex items-center break-words rounded border border-grey-02 bg-white px-1.5 py-1 text-left text-metadataMedium !font-normal !leading-[1.125rem] hover:cursor-pointer hover:border-text hover:text-text focus:cursor-pointer focus:border-text focus:bg-ctaTertiary focus:text-text focus:shadow-inner-lg transition-colors',
  {
    variants: {
      shouldClamp: {
        false: 'items-center',
        true: 'line-clamp-4',
      },
    },
    defaultVariants: {
      shouldClamp: false,
    },
  }
);

export function PowerToolsRelationChip({
  relationId,
  relationName,
  spaceId,
  relationSpaceId,
  onClick,
  verified = false
}: Props) {
  // Use the useName hook to get the actual entity name if not provided
  const entityName = useName(relationId);
  const displayName = relationName || entityName || relationId.slice(0, 8);

  const shouldClamp = typeof displayName === 'string' && displayName.length >= 42;

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(relationId, relationSpaceId);
      }}
      className={chipStyles({ shouldClamp })}
      title={`Click to view ${displayName}`}
    >
      <span>{displayName}</span>
      {verified && (
        <span className="ml-1 text-green-600">✓</span>
      )}
    </button>
  );
}