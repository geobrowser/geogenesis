'use client';

import { GraphUrl } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { cva, cx } from 'class-variance-authority';

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
      false: 'text-ctaPrimary no-underline transition-colors duration-75 hover:text-ctaHover hover:underline',
    },
  },
  compoundVariants: [
    {
      editable: false,
      variant: 'tableCell',
      className: 'line-clamp-1 break-all',
    },
    {
      editable: false,
      variant: ['body', 'tableProperty'],
      className: 'truncate',
    },
  ],
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
  /**
   * Render the URL as plain styled text instead of an anchor. Required when
   * the field sits inside another link — nested <a> is invalid HTML and
   * causes hydration errors.
   */
  disableLink?: boolean;
};

export function WebUrlField({
  variant = 'body',
  isEditing = false,
  spaceId,
  value,
  format,
  className = '',
  disableLink = false,
  placeholder = 'Add value...',
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
    return <GraphUrlField currentSpaceId={spaceId} value={value as `graph://${string}`} disableLink={disableLink} />;
  }

  // Check if URL has a protocol (http://, https://, mailto:, tel:, etc.)
  // If not, prepend https:// to prevent relative path behavior
  const hrefSource = resolvedUrl ?? value;
  const normalizedUrl =
    hrefSource && !hrefSource.match(/^[a-zA-Z][a-zA-Z\d+\-.]*:/) ? `https://${hrefSource}` : hrefSource;
  return isEditing ? (
    <input
      {...props}
      placeholder={placeholder}
      value={localValue}
      className={cx(
        webUrlFieldStyles({ variant, editable: isEditing, className }),
        variant === 'tableCell' && 'min-w-0 truncate'
      )}
      onChange={e => setLocalValue(e.currentTarget.value)}
    />
  ) : disableLink ? (
    <span className={webUrlFieldStyles({ variant, editable: isEditing, className })}>{value}</span>
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
  disableLink?: boolean;
};

const GraphUrlField = ({ currentSpaceId, value, disableLink = false }: GraphUrlFieldProps) => {
  const entityId = GraphUrl.toEntityId(value);
  const spaceId = GraphUrl.toSpaceId(value) ?? currentSpaceId;
  const name = useName(entityId);

  const entityName = name ?? value;
  const href = `/space/${spaceId}/${entityId}`;

  return (
    <LinkableChip href={href} disableLink={disableLink}>
      {entityName}
    </LinkableChip>
  );
};
