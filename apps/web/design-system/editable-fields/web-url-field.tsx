'use client';

import { GraphUrl } from '@geoprotocol/geo-sdk';
import { cva } from 'class-variance-authority';

import * as React from 'react';

import { useName } from '~/core/state/entity-page-store/entity-store';
import { isUrlTemplate, resolveUrlTemplate } from '~/core/utils/url-template';

import { LinkableChip } from '~/design-system/chip';

const webUrlFieldStyles = cva('w-full bg-transparent placeholder:text-grey-02 focus:outline-hidden', {
  variants: {
    variant: {
      body: 'text-body',
      tableCell: 'text-tableCell',
      tableProperty: 'text-tableProperty! text-link! underline! decoration-1 hover:text-text!',
    },
    editable: {
      false: 'truncate text-ctaPrimary no-underline transition-colors duration-75 hover:text-ctaHover hover:underline',
    },
  },
  defaultVariants: {
    variant: 'body',
  },
});

type WebUrlFieldProps = {
  isEditing?: boolean;
  placeholder?: string;
  spaceId: string;
  value: string;
  format?: string | null;
  onBlur?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  variant?: 'body' | 'tableCell' | 'tableProperty';
  className?: string;
};

export function WebUrlField({
  variant = 'body',
  isEditing = false,
  spaceId,
  value,
  format,
  className = '',
  ...props
}: WebUrlFieldProps) {
  // We use the local value and onBlur to improve performance when WebUrlField is rendered
  // in a large table. Our Actions model means that every keystroke triggers a re-render
  // of all fields deriving data from the ActionStore.
  const [localValue, setLocalValue] = React.useState(value);

  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const resolvedUrl = isUrlTemplate(format) ? resolveUrlTemplate(format, value) : undefined;

  if (!resolvedUrl && value.startsWith('graph://')) {
    return <GraphUrlField currentSpaceId={spaceId} value={value as `graph://${string}`} />;
  }

  // Check if URL has a protocol (http://, https://, mailto:, tel:, etc.)
  // If not, prepend https:// to prevent relative path behavior
  const hrefSource = resolvedUrl ?? value;
  const normalizedUrl =
    hrefSource && !hrefSource.match(/^[a-zA-Z][a-zA-Z\d+\-.]*:/) ? `https://${hrefSource}` : hrefSource;
  return isEditing ? (
    <input
      {...props}
      value={localValue}
      className={webUrlFieldStyles({ variant, editable: isEditing, className })}
      onChange={e => setLocalValue(e.currentTarget.value)}
    />
  ) : (
    <a
      href={normalizedUrl}
      target="_blank"
      rel="noreferrer"
      className={webUrlFieldStyles({ variant, editable: isEditing, className })}
    >
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
  const name = useName(entityId);

  const entityName = name ?? value;
  const href = `/space/${spaceId}/${entityId}`;

  return <LinkableChip href={href}>{entityName}</LinkableChip>;
};
