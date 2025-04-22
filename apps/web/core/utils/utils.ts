import { Base58 } from '@graphprotocol/grc-20';
import { parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { IntlMessageFormat } from 'intl-messageformat';
import { validate as uuidValidate, version as uuidVersion } from 'uuid';
import { getAddress } from 'viem';

import { IPFS_GATEWAY_READ_PATH, ROOT_SPACE_ID } from '~/core/constants';
import { EntityId } from '~/core/io/schema';

import { Entity } from '../io/dto/entities';
import { Proposal } from '../io/dto/proposals';
import { SubstreamVote } from '../io/schema';
import { Entities } from './entity';

export function intersperse<T>(elements: T[], separator: T | (({ index }: { index: number }) => T)): T[] {
  return elements.flatMap((element, index) =>
    index === 0 ? [element] : [separator instanceof Function ? separator({ index }) : separator, element]
  );
}

export const NavUtils = {
  toRoot: () => '/root',
  toHome: () => `/home`,
  toAdmin: (spaceId: string) => `/space/${spaceId}/access-control`,
  toSpace: (spaceId: string) => (spaceId === ROOT_SPACE_ID ? `/root` : `/space/${spaceId}`),
  toProposal: (spaceId: string, proposalId: string) => `/space/${spaceId}/governance?proposalId=${proposalId}`,
  toEntity: (spaceId: string, newEntityId: string, editParam?: boolean, newEntityName?: string) => {
    return `/space/${spaceId}/${newEntityId}${editParam ? '?edit=true' : ''}${editParam && newEntityName ? `&entityName=${newEntityName}` : ''}`;
  },
  toSpaceProfileActivity: (spaceId: string, spaceIdParam?: string) => {
    if (spaceIdParam) {
      return `/space/${spaceId}/activity?spaceId=${spaceIdParam}`;
    }

    return `/space/${spaceId}/activity`;
  },
  toProfileActivity: (spaceId: string, entityId: string, spaceIdParam?: string) => {
    if (spaceIdParam) {
      return `/space/${spaceId}/${entityId}/activity?spaceId=${spaceIdParam}`;
    }

    return `/space/${spaceId}/${entityId}/activity`;
  },
};

export function groupBy<T, U extends PropertyKey>(values: T[], projection: (value: T) => U) {
  const result: { [key in PropertyKey]: T[] } = {};

  for (const value of values) {
    const key = projection(value);

    if (key in result) {
      result[key].push(value);
    } else {
      result[key] = [value];
    }
  }

  return result;
}

export function formatShortAddress(address: string): string {
  return address.slice(0, 8) + '...' + address.slice(-6);
}

export class GeoNumber {
  static defaultFormat = 'precision-unlimited';

  static format(value?: string | number, formatPattern?: string, locale = 'en') {
    try {
      const numericValue = typeof value === 'string' ? parseFloat(value) : value;

      if (numericValue === undefined || isNaN(numericValue)) {
        throw new Error('Invalid number');
      }

      const formatToUse = formatPattern || GeoNumber.defaultFormat;
      const intlMessageFormat = formatToUse.startsWith('::') ? formatToUse : `::${formatToUse}`;

      const message = new IntlMessageFormat(`{value, number, ${intlMessageFormat}}`, locale);
      return message.format({ value: numericValue });
    } catch (e) {
      console.error(`Unable to format number: "${value}" with format: "${formatPattern}".`);
      return value;
    }
  }
}

export class GeoDate {
  static defaultFormat = 'MMM d, yyyy - h:mmaaa';

  /**
   * We return blocktime from the subgraph for createdAt and updatedAt fields.
   * JavaScript date expects milliseconds, so we need to convert from seconds.
   */
  static fromGeoTime(value: number) {
    return new Date(value * 1000);
  }

  static toGeoTime(value: number) {
    return Math.floor(value / 1000);
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
    if (hour === '') {
      return new Date(`${year}-${month}-${day}`).toISOString();
    }

    let paddedHour = hour;
    let paddedMinute = minute;

    if (Number(minute) < 10 && minute !== '') {
      paddedMinute = minute.padStart(2, '0');
    }

    if (Number(hour) < 10 && hour !== '') {
      paddedHour = hour.padStart(2, '0');
    }

    if (minute === '') {
      paddedMinute = '00';
    }

    if (hour === '') {
      paddedHour = '00';
    }

    try {
      const isoDate = new Date(`${year}-${month}-${day}T${paddedHour}:${paddedMinute}:00.000+00:00`); // UTC
      return isoDate.toISOString();
    } catch (e) {
      console.error('failed parsing UTC', e);
      throw e;
    }
  }

  // Geo DateField parses ISO strings in UTC time into day, month, year, hour, minute.
  static fromISOStringUTC(dateString: string): {
    day: string;
    month: string;
    year: string;
    hour: string;
    minute: string;
    meridiem: 'am' | 'pm';
  } {
    const date = new Date(dateString);
    const isDate = GeoDate.isValidDate(date);
    const day = isDate ? date.getUTCDate().toString() : '';
    const month = isDate ? (date.getUTCMonth() + 1).toString() : '';
    const year = isDate ? date.getUTCFullYear().toString() : '';
    let hour = isDate ? date.getUTCHours().toString() : '';
    const minute = isDate ? date.getUTCMinutes().toString() : '';
    let meridiem = isDate && hour !== '' ? (Number(hour) < 12 ? 'am' : 'pm') : 'am';

    if (hour !== '' && Number(hour) > 12) {
      const hourAsNumber = Number(hour);
      hour = (hourAsNumber - 12).toString();
    }

    if (hour !== '' && Number(hour) === 0) {
      hour = '12';
      meridiem = 'am';
    }

    return { day, month, year, hour, minute, meridiem: meridiem as 'am' | 'pm' };
  }

  static isLeapYear(year: number): boolean {
    return year % 4 === 0;
  }

  static isMonth30Days(month: number): boolean {
    return [4, 6, 9, 11].includes(month);
  }

  private static validateFormat = (format?: string) => {
    if (!format || typeof format !== 'string') {
      return this.defaultFormat;
    }

    try {
      const testDate = new Date();
      formatInTimeZone(testDate, 'UTC', format);
      return format;
    } catch (e) {
      console.warn(`Invalid date format: "${format}". Using default format instead.`);
      return this.defaultFormat;
    }
  };

  static format = (dateIsoString: string, displayFormat?: string) => {
    try {
      const validatedFormat = this.validateFormat(displayFormat);
      const date = parseISO(dateIsoString);
      return formatInTimeZone(date, 'UTC', validatedFormat);
    } catch (e) {
      console.error(`Unable to format date: "${dateIsoString}" with format: "${displayFormat}".`);
      return dateIsoString;
    }
  };
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

  return null;
};

export const getOpenGraphMetadataForEntity = (entity: Entity | null) => {
  const entityName = entity?.name ?? null;
  const serverAvatarUrl = Entities.avatar(entity?.relationsOut) ?? null;
  const serverCoverUrl = Entities.cover(entity?.relationsOut);

  const imageUrl = serverAvatarUrl ?? serverCoverUrl ?? '';
  const openGraphImageUrl = getOpenGraphImageUrl(imageUrl);
  const description = Entities.description(entity?.triples ?? []);

  return {
    entityName,
    openGraphImageUrl,
    description,
  };
};

// Get the image hash from an image path
// e.g., https://gateway.lighthouse.storage/ipfs/HASH
// e.g., ipfs://HASH -> HASH
export const getImageHash = (value: string) => {
  // If the value includes a query parameter, it's thhe legacy hard coded IPFS gateway path
  if (value.startsWith(IPFS_GATEWAY_READ_PATH)) {
    const [, hash] = value.split(IPFS_GATEWAY_READ_PATH);
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
    return `${IPFS_GATEWAY_READ_PATH}${getImageHash(value)}`;
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

export const sleep = (delay: number) => new Promise(resolve => setTimeout(resolve, delay));

export function toTitleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export function getProposalName(proposal: { name: string; type: Proposal['type']; space: Proposal['space'] }) {
  switch (proposal.type) {
    case 'ADD_EDIT':
      return proposal.name;
    case 'ADD_EDITOR':
      return `Add editor to ${proposal.space.name}`;
    case 'REMOVE_EDITOR':
      return `Remove editor from ${proposal.space.name}`;
    case 'ADD_MEMBER':
      return `Add member to ${proposal.space.name}`;
    case 'REMOVE_MEMBER':
      return `Remove member from ${proposal.space.name}`;
    case 'ADD_SUBSPACE':
      return `Add subspace to ${proposal.space.name}`;
    case 'REMOVE_SUBSPACE':
      return `Remove subspace from ${proposal.space.name}`;
  }
}

export function getIsProposalEnded(status: Proposal['status'], endTime: number) {
  return status === 'REJECTED' || status === 'ACCEPTED' || endTime < GeoDate.toGeoTime(Date.now());
}

export function getIsProposalExecutable(proposal: Proposal, yesVotesPercentage: number) {
  return (
    getIsProposalEnded(proposal.status, proposal.endTime) && yesVotesPercentage > 50 && proposal.status !== 'ACCEPTED'
  );
}

export function getYesVotePercentage(votes: SubstreamVote[], votesCount: number) {
  if (votesCount === 0) {
    return 0;
  }

  return Math.floor((votes.filter(v => v.vote === 'ACCEPT').length / votesCount) * 100);
}

export function getNoVotePercentage(votes: SubstreamVote[], votesCount: number) {
  if (votesCount === 0) {
    return 0;
  }

  return Math.floor((votes.filter(v => v.vote === 'REJECT').length / votesCount) * 100);
}

export function getUserVote(votes: SubstreamVote[], address: string) {
  return votes.find(v => v.accountId === getAddress(address));
}

export function getProposalTimeRemaining(endTime: number) {
  const timeRemaining = endTime - GeoDate.toGeoTime(Date.now());
  const days = Math.floor(timeRemaining / 86400);
  const hours = Math.floor((timeRemaining % 86400) / 3600);
  const minutes = Math.floor((timeRemaining % 3600) / 60);
  const seconds = Math.floor(timeRemaining % 60);

  return { days, hours, minutes, seconds };
}
export const uuidValidateV4 = (uuid: string) => {
  if (!uuid) return false;

  return uuidValidate(uuid) && uuidVersion(uuid) === 4;
};

export const validateEntityId = (maybeEntityId: EntityId | string | null | undefined) => {
  if (typeof maybeEntityId !== 'string') return false;

  if (!VALID_ENTITY_ID_LENGTHS.includes(maybeEntityId.length)) return false;

  for (const char of maybeEntityId) {
    const index = Base58.BASE58_ALLOWED_CHARS.indexOf(char);
    if (index === -1) {
      return false;
    }
  }

  return true;
};

const VALID_ENTITY_ID_LENGTHS = [21, 22];

export const getTabSlug = (label: string) => {
  return label
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
};
