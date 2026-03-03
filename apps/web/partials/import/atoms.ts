import { SystemIds } from '@geoprotocol/geo-sdk';
import { atom } from 'jotai';

import { Value } from '~/core/types';

export const loadingAtom = atom<boolean>(false);

export const stepAtom = atom<string>('step1');

export const recordsAtom = atom<Array<Array<string>>>([]);

/** Name of the uploaded CSV file */
export const fileNameAtom = atom<string | undefined>(undefined);

/** Type entity selected for all rows (when CSV has no Types column). id and name. */
export const selectedTypeAtom = atom<{ id: string; name: string | null } | null>(null);

/** If CSV has a "Types" column, its 0-based index; otherwise undefined */
export const typesColumnIndexAtom = atom<number | undefined>(undefined);

/** Column index -> property id. Must include one column mapped to NAME_PROPERTY. */
export const columnMappingAtom = atom<Record<number, string>>({});

export const headersAtom = atom(get => {
  const records = get(recordsAtom);
  return records?.[0] ?? [];
});

export const examplesAtom = atom(get => {
  const records = get(recordsAtom);
  return records?.[1] ?? [];
});

export const entityCountAtom = atom(get => {
  const records = get(recordsAtom).filter(e => e.length);
  return ((records?.length || 1) - 1).toLocaleString('en-US', { style: 'decimal' });
});

export const entityCountByTypeAtom = atom(get => {
  const actions = get(valuesAtom);

  const typeActions = actions.filter(action => action.property.id === SystemIds.TYPES_PROPERTY);

  const entitySetByType: Record<string, Set<string>> = {};

  // @TODO disabling for now to remove ENTITY values. We aren't supporting
  // the import flow yet anyway. Nov 20, 2024.
  // typeActions.forEach(action => {
  //   if (action.value.type !== 'ENTITY' || !action.value.name) return;

  //   if (!Object.hasOwn(entitySetByType, action.value.name)) {
  //     entitySetByType[action.value.name] = new Set();
  //   }

  //   entitySetByType[action.value.name].add(action.entityId);
  // });

  const entityCountByType: Array<{ name: string; count: string }> = [];

  Object.keys(entitySetByType).forEach(name => {
    entityCountByType.push({ name, count: entitySetByType[name].size.toLocaleString('en-US', { style: 'decimal' }) });
  });

  return entityCountByType;
});

export const valuesAtom = atom<Array<Value>>([]);

/** Generated relations (e.g. Types) for the import. Passed to makeBulkProposal with values. */
export const relationsAtom = atom<import('~/core/types').Relation[]>([]);

export const actionsCountAtom = atom(get => {
  const actions = get(valuesAtom);
  return actions.length.toLocaleString('en-US', { style: 'decimal' });
});

export const publishAtom = atom<boolean>(false);
