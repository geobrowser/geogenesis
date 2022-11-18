import { computed, ObservableComputed } from '@legendapp/state';
import { Triple } from './types';

export function makeOptionalComputed<T>(initialValue: T, observable: ObservableComputed<T>): ObservableComputed<T> {
  return computed(() => {
    const data = observable.get() as T;
    if (data === undefined) return initialValue;
    return data;
  });
}

export function intersperse<T>(elements: T[], separator: T | (({ index }: { index: number }) => T)): T[] {
  return elements.flatMap((element, index) =>
    index === 0 ? [element] : [separator instanceof Function ? separator({ index }) : separator, element]
  );
}

export function upperFirst(string: string): string {
  return string.slice(0, 1).toLocaleUpperCase() + string.slice(1);
}

export function titleCase(string: string): string {
  return string
    .split(' ')
    .map(word => upperFirst(word))
    .join(' ');
}

export const navUtils = {
  toSpace: (spaceId: string) => `/space/${spaceId}`,
  toEntity: (spaceId: string, entityId: string) => `/space/${spaceId}/entity/${entityId}`,
};

export function getEntityName(triples: Triple[]) {
  const nameValue = triples.find(triple => triple.attributeId === 'name')?.value;
  return nameValue?.type === 'string' ? nameValue.value : null;
}

export function getEntityDescription(triples: Triple[]) {
  const nameValue = triples.find(triple => triple.attributeId === 'description')?.value;
  return nameValue?.type === 'string' ? nameValue.value : null;
}
