'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';

import { useQueryProperties } from '~/core/sync/use-store';

import { Property } from '../types';

export function useProperties(propertyIds: string[]): Record<string, Property> {
  const { properties } = useQueryProperties({ ids: propertyIds });

  const sorted = sortProperties(properties ?? []);
  const map: Record<string, Property> = {};

  for (const p of sorted) {
    map[p.id] = p;
  }

  return map;
}

export function sortProperties(renderables: Property[]) {
  /* Visible triples includes both real triples and placeholder triples */
  return renderables.sort((renderableA, renderableB) => {
    // Always put an empty, placeholder triple with no attribute id at the bottom
    // of the list
    if (renderableA.id === '') return 1;

    const { id: attributeIdA, name: attributeNameA } = renderableA;
    const { id: attributeIdB, name: attributeNameB } = renderableB;

    const isNameA = attributeIdA === SystemIds.NAME_PROPERTY;
    const isNameB = attributeIdB === SystemIds.NAME_PROPERTY;
    const isDescriptionA = attributeIdA === SystemIds.DESCRIPTION_PROPERTY;
    const isDescriptionB = attributeIdB === SystemIds.DESCRIPTION_PROPERTY;
    const isTypesA = attributeIdA === SystemIds.TYPES_PROPERTY;
    const isTypesB = attributeIdB === SystemIds.TYPES_PROPERTY;

    if (isNameA && !isNameB) return -1;
    if (!isNameA && isNameB) return 1;

    if (isDescriptionA && !isDescriptionB) return -1;
    if (!isDescriptionA && isDescriptionB) return 1;

    if (isTypesA && !isTypesB) return -1;
    if (!isTypesA && isTypesB) return 1;

    return (attributeNameA || '').localeCompare(attributeNameB || '');
  });
}
