import { SYSTEM_IDS } from '@geogenesis/sdk';
import { atom } from 'jotai';

import { Triple } from '~/core/types';

export const loadingAtom = atom<boolean>(false);

export const stepAtom = atom<string>('step1');

export const recordsAtom = atom<Array<Array<string>>>([]);

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
  const actions = get(triplesAtom);

  const typeActions = actions.filter(action => action.attributeId === SYSTEM_IDS.TYPES_ATTRIBUTE);

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

export const triplesAtom = atom<Array<Triple>>([]);

export const actionsCountAtom = atom(get => {
  const actions = get(triplesAtom);
  return actions.length.toLocaleString('en-US', { style: 'decimal' });
});

export const publishAtom = atom<boolean>(false);
