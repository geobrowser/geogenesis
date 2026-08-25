'use client';

import * as React from 'react';

import { useRelationTargetTypeIds } from '~/core/hooks/use-relation-target-type-ids';
import { ID } from '~/core/id';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Property } from '~/core/types';

export type DropdownOption = { id: string; name: string | null };

/** Bound the option list; the target types of a relation property can be broad. */
const MAX_DROPDOWN_OPTIONS = 100;

/**
 * Candidate values for one browse-mode dropdown: entities of the property's
 * relation target type(s), scoped to the block's space — the same vocabulary
 * the filter-creation prompt searches for that property. Entities that are
 * already selected or are the block filter's defaults are always merged in,
 * so a preset is never missing from its own dropdown.
 */
export function useDropdownOptions({
  property,
  spaceId,
  pinned,
}: {
  property: Property | undefined;
  spaceId: string;
  /** Ids (with names when known) that must appear regardless of the fetch window. */
  pinned: DropdownOption[];
}) {
  const { typeIds, waitForFilterTypes } = useRelationTargetTypeIds({
    propertyId: property?.id,
    spaceId,
    relationValueTypes: property?.relationValueTypes,
  });

  const hasTargetTypes = Boolean(typeIds && typeIds.length > 0);

  const where = React.useMemo(() => {
    if (!typeIds || typeIds.length === 0) return {};
    return {
      spaces: [{ equals: spaceId }],
      types: typeIds.map(id => ({ id: { equals: id } })),
    };
  }, [typeIds, spaceId]);

  const { entities, isLoading } = useQueryEntities({
    where,
    first: MAX_DROPDOWN_OPTIONS,
    enabled: hasTargetTypes && !waitForFilterTypes,
  });

  const options: DropdownOption[] = React.useMemo(() => {
    const byId = new Map<string, DropdownOption>();
    for (const entity of entities) byId.set(entity.id, { id: entity.id, name: entity.name ?? null });
    for (const pin of pinned) {
      const existing = byId.get(pin.id);
      if (!existing) byId.set(pin.id, pin);
      else if (!existing.name && pin.name) byId.set(pin.id, pin);
    }
    return [...byId.values()].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  }, [entities, pinned]);

  const nameOf = React.useCallback(
    (id: string) => options.find(option => ID.equals(option.id, id))?.name ?? null,
    [options]
  );

  return {
    options,
    nameOf,
    isLoading: hasTargetTypes && (waitForFilterTypes || isLoading),
    /** No resolvable target type: the dropdown can still show pinned values. */
    hasTargetTypes,
  };
}
