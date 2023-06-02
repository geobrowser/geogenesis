import { computed, ObservableComputed } from '@legendapp/state';

import { DEFAULT_OPENGRAPH_IMAGE } from './constants';

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
  return string.slice(0, 1).toUpperCase() + string.slice(1);
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
  toCreateEntity: (spaceId: string, typeId?: string | null, filterId?: string | null, filterValue?: string | null) => {
    if (typeId && filterId && filterValue) {
      return `/space/${spaceId}/create-entity?typeId=${typeId}&filterId=${filterId}&filterValue=${filterValue}`;
    }

    if (typeId) {
      return `/space/${spaceId}/create-entity?typeId=${typeId}`;
    }

    return `/space/${spaceId}/create-entity`;
  },
};

export function getFilesFromFileList(fileList: FileList): File[] {
  const files: File[] = [];
  for (let i = 0; i < fileList.length; i++) {
    files.push(fileList[i]);
  }
  return files;
}

export function groupBy<T, U extends PropertyKey>(values: T[], projection: (value: T) => U) {
  const result: { [key in PropertyKey]: T[] } = {};

  values.forEach(value => {
    const key = projection(value);

    if (key in result) {
      result[key].push(value);
    } else {
      result[key] = [value];
    }
  });

  return result;
}

export function partition<T>(array: T[], predicate: (value: T) => boolean): [T[], T[]] {
  return array.reduce<[T[], T[]]>(
    ([pass, fail], item) => {
      return predicate(item) ? [[...pass, item], fail] : [pass, [...fail, item]];
    },
    [[], []]
  );
}

export function formatShortAddress(address: string): string {
  return address.slice(0, 8) + '...' + address.slice(-6);
}

export class GeoDate {
  /**
   * We return blocktime from the subgraph for createdAt and updatedAt fields.
   * JavaScript date expects milliseconds, so we need to convert from seconds.
   */
  static fromGeoTime(value: number) {
    return new Date(value * 1000);
  }
}

export const getOpenGraphImageUrl = (value: string) => {
  if (value.startsWith('https://api.thegraph.com/ipfs')) {
    const hash = value.split('=')[1];
    return `https://www.geobrowser.io/preview/${hash}.png`;
  } else if (value.startsWith('http')) {
    return value;
  } else if (value) {
    return `https://www.geobrowser.io/preview/${value}.png`;
  } else {
    return DEFAULT_OPENGRAPH_IMAGE;
  }
};

// https://geobrowser.io/api/og?hash=
