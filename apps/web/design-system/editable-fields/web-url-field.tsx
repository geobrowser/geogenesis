'use client';

import { GraphUrl } from '@graphprotocol/grc-20';
import { cva } from 'class-variance-authority';

import * as React from 'react';

import { useEntity } from '~/core/database/entities';
import { EntityId } from '~/core/io/schema';

import { LinkableChip } from '~/design-system/chip';

const webUrlFieldStyles = cva('w-full bg-transparent placeholder:text-grey-02 focus:outline-none', {
  variants: {
    variant: {
      body: 'text-body',
      tableCell: 'text-tableCell',
    },
    editable: {
      false: 'truncate text-ctaPrimary no-underline transition-colors duration-75 hover:text-ctaHover hover:underline',
    },
  },
  defaultVariants: {
    variant: 'body',
  },
});

interface Props {
  isEditing?: boolean;
  placeholder?: string;
  spaceId: string;
  value: string;
  onBlur?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  variant?: 'body' | 'tableCell';
}

export function WebUrlField({ variant = 'body', isEditing = false, spaceId, value, ...props }: Props) {
  // We use the local value and onBlur to improve performance when WebUrlField is rendered
  // in a large table. Our Actions model means that every keystroke triggers a re-render
  // of all fields deriving data from the ActionStore.
  const [localValue, setLocalValue] = React.useState(value);

  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  if (value.startsWith('graph://')) {
    return <GraphUrlField currentSpaceId={spaceId} value={value as `graph://${string}`} />;
  }

  return isEditing ? (
    <input
      {...props}
      value={localValue}
      className={webUrlFieldStyles({ variant, editable: isEditing })}
      onChange={e => setLocalValue(e.currentTarget.value)}
    />
  ) : (
    <a href={value} target="_blank" rel="noreferrer" className={webUrlFieldStyles({ variant, editable: isEditing })}>
      {value}
    </a>
  );
}

type GraphUrlFieldProps = {
  currentSpaceId: string;
  value: `graph://${string}`;
};

const GraphUrlField = ({ currentSpaceId, value }: GraphUrlFieldProps) => {
  const entityId = GraphUrl.toEntityId(value);
  const spaceId = GraphUrl.toSpaceId(value) ?? currentSpaceId;

  const entity = useEntity({ id: EntityId(entityId) });

  const entityName = entity.name || value;
  const href = `/space/${spaceId}/${entityId}`;

  return <LinkableChip href={href}>{entityName}</LinkableChip>;
};
