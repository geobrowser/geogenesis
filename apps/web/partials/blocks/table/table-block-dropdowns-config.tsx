'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import type { BlockDropdownConfig } from '~/core/blocks/data/use-block-dropdowns';
import { ID } from '~/core/id';
import type { Property } from '~/core/types';

import { SmallButton } from '~/design-system/button';
import { CheckboxVisual } from '~/design-system/checkbox';
import { CloseSmall } from '~/design-system/icons/close-small';
import { CreateSmall } from '~/design-system/icons/create-small';
import { Input } from '~/design-system/input';
import { Menu } from '~/design-system/menu';

type TableBlockDropdownsConfigProps = {
  configs: BlockDropdownConfig[];
  properties: Property[];
  toggleDropdownProperty: (property: { id: string; name: string | null }) => void;
};

/**
 * Edit-mode configuration of a block's browse dropdowns — the one place the
 * block's `Dropdowns` relations are set. Two parts so the toolbar stays
 * stable: the "+ Dropdown" trigger sits next to "+ Filter" and never moves,
 * while the configured dropdowns render as removable chips in the pills row
 * below, alongside the filter pills.
 */
export function TableBlockDropdownsConfigTrigger({
  configs,
  properties,
  toggleDropdownProperty,
}: TableBlockDropdownsConfigProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');

  React.useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const relationProperties = React.useMemo(
    () =>
      properties
        .filter(p => p.dataType === 'RELATION' && !ID.equals(p.id, SystemIds.NAME_PROPERTY))
        .filter((p, index, all) => all.findIndex(other => ID.equals(other.id, p.id)) === index)
        .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id)),
    [properties]
  );

  const query = search.trim().toLowerCase();
  const visibleProperties = query
    ? relationProperties.filter(p => (p.name ?? p.id).toLowerCase().includes(query))
    : relationProperties;

  const isConfigured = (propertyId: string) => configs.some(config => ID.equals(config.propertyId, propertyId));

  return (
    <Menu
      asChild
      open={open}
      onOpenChange={setOpen}
      onCloseAutoFocus={event => event.preventDefault()}
      className="max-w-[280px]"
      trigger={
        <SmallButton icon={<CreateSmall />} variant="secondary">
          Dropdown
        </SmallButton>
      }
    >
      <div className="flex flex-col p-2">
        <div className="pb-2">
          <Input
            withSearchIcon
            placeholder="Search properties..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => e.stopPropagation()}
          />
        </div>
        {visibleProperties.length === 0 && (
          <p className="px-2 py-2 text-sm text-grey-04">
            {query ? 'No matching properties' : 'No relation properties'}
          </p>
        )}
        {visibleProperties.map(property => {
          const checked = isConfigured(property.id);
          return (
            <button
              key={property.id}
              type="button"
              role="menuitemcheckbox"
              aria-checked={checked}
              onClick={() => toggleDropdownProperty({ id: property.id, name: property.name })}
              className="flex items-center gap-2 rounded px-2 py-2 text-left text-sm text-text hover:bg-grey-01"
            >
              <CheckboxVisual checked={checked} />
              <span className="min-w-0 truncate">{property.name ?? property.id}</span>
            </button>
          );
        })}
      </div>
    </Menu>
  );
}

/** The configured dropdowns as removable chips; renders nothing when there are none. */
export function TableBlockDropdownsConfigChips({
  configs,
  properties,
  toggleDropdownProperty,
}: TableBlockDropdownsConfigProps) {
  if (configs.length === 0) return null;

  return (
    <>
      {configs.map(config => {
        const property = properties.find(p => ID.equals(p.id, config.propertyId));
        const label = config.propertyName ?? property?.name ?? config.propertyId;
        return (
          <span
            key={config.propertyId}
            className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-grey-02 bg-white px-1.5 text-metadata leading-none text-text"
          >
            <span className="text-grey-04">Dropdown</span>
            <span className="max-w-[160px] truncate">{label}</span>
            <button
              type="button"
              onClick={() => toggleDropdownProperty({ id: config.propertyId, name: label })}
              className="inline-flex shrink-0 text-grey-04 transition-colors hover:text-text"
              aria-label={`Remove ${label} dropdown`}
            >
              <CloseSmall />
            </button>
          </span>
        );
      })}
    </>
  );
}
