import { computed, ObservableComputed } from '@legendapp/state';

import { DEFAULT_OPENGRAPH_DESCRIPTION, DEFAULT_OPENGRAPH_IMAGE } from '~/core/constants';
import { Entity } from './entity';
import { Entity as IEntity } from '~/core/types';

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
  toAdmin: (spaceId: string) => `/space/${spaceId}/access-control`,
  toSpace: (spaceId: string) => `/space/${spaceId}`,
  toEntity: (
    spaceId: string,
    newEntityId: string,
    typeId?: string | null,
    filterId?: string | null,
    filterValue?: string | null
  ) => {
    if (typeId && filterId && filterValue) {
      return `/space/${spaceId}/${newEntityId}?typeId=${typeId}&filterId=${filterId}&filterValue=${filterValue}`;
    }

    if (typeId) {
      return `/space/${spaceId}/${newEntityId}?typeId=${typeId}`;
    }

    return `/space/${spaceId}/${newEntityId}`;
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

  static isValidDate(date: Date): date is Date {
    return date instanceof Date && !isNaN(date.getMilliseconds());
  }

  // Geo DateField expects ISO strings to be set in UTC time.
  static toISOStringUTC({
    day,
    month,
    year,
    hour,
    minute,
  }: {
    day: string;
    month: string;
    year: string;
    hour: string;
    minute: string;
  }): string {
    const isoDate = new Date(`${month}-${day}-${year} ${hour}:${minute} UTC`);
    return isoDate.toISOString();
  }

  // Geo DateField parses ISO strings in UTC time into day, month, year, hour, minute.
  static fromISOStringUTC(dateString: string): {
    day: string;
    month: string;
    year: string;
    hour: string;
    minute: string;
  } {
    const date = new Date(dateString);
    const isDate = GeoDate.isValidDate(date);
    const day = isDate ? date.getUTCDate().toString() : '';
    const month = isDate ? (date.getUTCMonth() + 1).toString() : '';
    const year = isDate ? date.getUTCFullYear().toString() : '';
    const hour = isDate ? date.getUTCHours().toString() : '';
    const minute = isDate ? date.getUTCMinutes().toString() : '';

    return { day, month, year, hour, minute };
  }

  static isLeapYear(year: number): boolean {
    return year % 4 === 0;
  }

  static isMonth30Days(month: number): boolean {
    return [4, 6, 9, 11].includes(month);
  }
}

// We rewrite the URL to use the geobrowser preview API in vercel.json.
// This forces the image to be fetched with a file extension as a workaround
// for some services not parsing images without a file extension. Looking at
// you TWITTER.
// https://geobrowser.io/preview/{hash}.png -> https://geobrowser.io/api/og?hash=
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

export const getOpenGraphMetadataForEntity = (entity: IEntity | null) => {
  const entityName = entity?.name ?? null;
  const serverAvatarUrl = Entity.avatar(entity?.triples) ?? null;
  const serverCoverUrl = Entity.cover(entity?.triples);
  const imageUrl = serverAvatarUrl || serverCoverUrl || '';
  const openGraphImageUrl = getOpenGraphImageUrl(imageUrl);
  const description = Entity.description(entity?.triples ?? []) || DEFAULT_OPENGRAPH_DESCRIPTION;

  return {
    entityName,
    openGraphImageUrl,
    description,
  };
};

// Get the image hash from an image path
// e.g., https://api.thegraph.com/ipfs/api/v0/cat?arg=HASH -> HASH
// e.g., ipfs://HASH -> HASH
export const getImageHash = (value: string) => {
  // If the value includes a query parameter, it's thhe legacy hard coded IPFS gateway path
  if (value.includes('?arg=')) {
    const [, hash] = value.split('?arg=');
    return hash as string;
  } else if (value.includes('://')) {
    const [, hash] = value.split('://');
    return hash as string;
    // If the value does not contain an arg query parameter or protocol prefix, it already is a hash
  } else {
    return value;
  }
};

// Get the image URL from an image triple value
// this allows us to render images on the front-end based on a raw triple value
// e.g., ipfs://HASH -> https://api.thegraph.com/ipfs/api/v0/cat?arg=HASH
export const getImagePath = (value: string) => {
  // Add the IPFS gateway path for images with the ipfs:// protocol
  if (value.startsWith('ipfs://')) {
    return `${process.env.NEXT_PUBLIC_IPFS_GATEWAY_PATH}${getImageHash(value)}`;
    // If the value starts with `http`, it already includes the legacy hard coded IPFS gateway path
  } else if (value.startsWith('http')) {
    return value;
  } else {
    return '';
  }
};
