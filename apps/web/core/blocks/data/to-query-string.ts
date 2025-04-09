import { SystemIds } from '@graphprotocol/grc-20';

import { OmitStrict } from '~/core/types';

import { Filter } from './filters';

export function queryStringFromFilters(
  filters: OmitStrict<Filter, 'valueName' | 'columnName' | 'relationValueTypes'>[]
): string {
  if (filters.length === 0) return '';

  const filtersAsStrings = filters
    .map(filter => {
      // Assume we can only filter by one type at a time for now
      if (filter.columnId === SystemIds.TYPES_ATTRIBUTE && filter.valueType === 'RELATION') {
        return `versionTypes: { some: { type: { entityId: {equalTo: "${filter.value}" } } } }`;
      }

      // We treat Name and Space as special filters even though they are not always
      // columns on the type schema for a table. We allow users to be able to filter
      // by name and space.
      if (filter.columnId === SystemIds.NAME_ATTRIBUTE && filter.valueType === 'TEXT') {
        // For the name we can just search for the name based on the indexed GeoEntity name
        return `name: { startsWithInsensitive: "${filter.value}" }`;
      }

      if (filter.columnId === SystemIds.SPACE_FILTER && filter.valueType === 'RELATION') {
        return `versionSpaces: {
          some: {
            spaceId: { equalTo: "${filter.value}" }
          }
        }`;
      }

      if (filter.valueType === 'TEXT') {
        // value is just the textValue of the triple
        return `triples: { some: { attributeId: { equalTo: "${filter.columnId}" }, textValue: { equalToInsensitive: "${filter.value}"} } }`;
      }

      if (filter.valueType === 'RELATION') {
        return `relationsByFromVersionId: {
                some: {
                  typeOf: { id: { equalTo: "${filter.columnId}" } }
                  toEntity: { id: { equalTo: "${filter.value}" } }
                }
              }`;
      }

      // We don't support other value types yet
      return null;
    })
    .flatMap(f => (f ? [f] : []));

  if (filtersAsStrings.length === 1) {
    return `${filtersAsStrings[0]}`;
  }

  // Wrap each filter expression in curly brackets
  const multiFilterQuery = filtersAsStrings.map(f => `{ ${f} }`).join(', ');

  return `and: [${multiFilterQuery}]`;
}
