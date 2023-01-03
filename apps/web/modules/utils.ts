import { computed, ObservableComputed } from '@legendapp/state';
import { A, F, O, pipe } from '@mobily/ts-belt';
import { FilterState } from './types';

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

export const NavUtils = {
  toSpace: (spaceId: string) => `/space/${spaceId}`,
  toEntity: (spaceId: string, entityId: string) => `/space/${spaceId}/${entityId}`,
  toCreateEntity: (spaceId: string) => `/space/${spaceId}/create-entity`,
};

export function isOnlyEntityNameFilter(filter: FilterState): boolean {
  const onlyOneFilter = pipe(filter, A.length, F.equals(1));
  const filterIsEntityName = pipe(
    filter,
    A.head,
    O.map(filter => filter.field),
    O.filter(value => value === 'entity-name'),
    O.isSome
  );

  return onlyOneFilter && filterIsEntityName;
}

export function getFilesFromFileList(fileList: FileList): File[] {
  const files: File[] = [];
  for (const file of fileList) {
    files.push(file);
  }
  return files;
}
