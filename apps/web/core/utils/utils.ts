import { DEFAULT_OPENGRAPH_DESCRIPTION, DEFAULT_OPENGRAPH_IMAGE, IPFS_GATEWAY_PATH } from '~/core/constants';
import { Entity as IEntity } from '~/core/types';

import { Entity } from './entity';

export function intersperse<T>(elements: T[], separator: T | (({ index }: { index: number }) => T)): T[] {
  return elements.flatMap((element, index) =>
    index === 0 ? [element] : [separator instanceof Function ? separator({ index }) : separator, element]
  );
}

export const NavUtils = {
  toHome: () => `/home`,
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
      return decodeURIComponent(
        `/space/${spaceId}/${newEntityId}?typeId=${typeId}&filterId=${filterId}&filterValue=${filterValue}`
      );
    }

    if (typeId) {
      return decodeURIComponent(`/space/${spaceId}/${newEntityId}?typeId=${typeId}`);
    }

    return decodeURIComponent(`/space/${spaceId}/${newEntityId}`);
  },
  toProfileActivity: (spaceId: string, entityId: string, spaceIdParam?: string) => {
    if (spaceIdParam) {
      return decodeURIComponent(`/space/${spaceId}/${entityId}/activity?spaceId=${spaceIdParam}`);
    }

    return decodeURIComponent(`/space/${spaceId}/${entityId}/activity`);
  },
};

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
  } else if (value.startsWith('ipfs://')) {
    return `https://www.geobrowser.io/preview/${getImageHash(value)}.png`;
  } else if (value) {
    return `https://www.geobrowser.io/preview/${value}.png`;
  }

  return DEFAULT_OPENGRAPH_IMAGE;
};

export const getOpenGraphMetadataForEntity = (entity: IEntity | null) => {
  const entityName = entity?.name ?? null;
  const serverAvatarUrl = Entity.avatar(entity?.triples) ?? null;
  const serverCoverUrl = Entity.cover(entity?.triples);
  const imageUrl = serverAvatarUrl || serverCoverUrl || '';
  const openGraphImageUrl = getOpenGraphImageUrl(imageUrl);
  const description = Entity.description(entity?.triples ?? []);

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
    return hash;
  } else if (value.includes('://')) {
    const [, hash] = value.split('://');
    return hash;
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
    return `${IPFS_GATEWAY_PATH}${getImageHash(value)}`;
    // The image likely resolves to an image resource at some URL
  } else if (value.startsWith('http')) {
    return value;
  } else {
    // The image is likely a static, bundled path
    return value;
  }
};

export function getRandomArrayItem(array: string[]) {
  const randomIndex = Math.floor(Math.random() * array.length);
  return array[randomIndex];
}

export const sleepWithCallback = async (callback: () => void, ms: number) => {
  await new Promise(resolve => {
    setTimeout(callback, ms);
    resolve(null);
  });
};

/**
 * Provides structured logging for Geo.
 * @param requestId - A unique identifier for the request. This should be used across all logs for a single request/workflow.
 * @param message - The message to log.
 * @param account - The account that initiated the request. This is usually the user's wallet address. This helps debug user-specific
 *                  issues.
 * @param level - The log level. Defaults to 'info'.
 */
export function slog({
  requestId,
  message,
  account,
  level,
}: {
  requestId: string;
  message: string;
  account?: `0x${string}`;
  level?: 'log' | 'info' | 'warn' | 'error';
}) {
  if (!level) {
    level = 'info';
  }

  console[level](
    `${level.toUpperCase()}  ${new Date().toISOString()}  account: ${
      account ? account : 'NULL'
    }  requestId: ${requestId} – ${message}`
  );
}

export function getGeoPersonIdFromOnchainId(address: `0x${string}`, onchainId: string) {
  return `${address}–${onchainId}`;
}

export const sleep = (delay: number) => new Promise(resolve => setTimeout(resolve, delay));
