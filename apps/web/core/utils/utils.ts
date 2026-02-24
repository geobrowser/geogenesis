import { IdUtils } from '@geoprotocol/geo-sdk';
import { Position } from '@geoprotocol/geo-sdk';
import { parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { IntlMessageFormat } from 'intl-messageformat';
import { validate as uuidValidate, version as uuidVersion } from 'uuid';
import { getAddress } from 'viem';

import { IPFS_GATEWAY_READ_PATH, PINATA_GATEWAY_READ_PATH, ROOT_SPACE } from '~/core/constants';
import { EntityId, ProposalStatus } from '~/core/io/substream-schema';

import { Proposal } from '../io/dto/proposals';
import { SubstreamVote } from '../io/substream-schema';
import { Entity, Relation, Row } from '../types';
import { Entities } from './entity';

export const NavUtils = {
  toRoot: () => '/root',
  toHome: () => `/home`,
  toAdmin: (spaceId: string) => `/space/${spaceId}/access-control`,
  toSpace: (spaceId: string) => (spaceId === ROOT_SPACE ? `/root` : `/space/${spaceId}`),
  toProposal: (spaceId: string, proposalId: string, from?: string) =>
    `/space/${spaceId}/governance?proposalId=${proposalId}${from ? `&from=${from}` : ''}`,
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

  static format(value?: string | number, formatPattern?: string, currencySymbol: string = '', locale = 'en') {
    try {
      const numericValue = typeof value === 'string' ? parseFloat(value) : value;

      if (numericValue === undefined || isNaN(numericValue)) {
        throw new Error('Invalid number');
      }

      const formatToUse = formatPattern || GeoNumber.defaultFormat;
      const intlMessageFormat = formatToUse.startsWith('::') ? formatToUse : `::${formatToUse}`;

      const message = new IntlMessageFormat(`{value, number, ${intlMessageFormat}}`, locale);
      return `${currencySymbol}${message.format({ value: numericValue })}`;
    } catch (e) {
      console.error(`Unable to format number: "${value}" with format: "${formatPattern}".`);
      return value;
    }
  }
}

export class GeoPoint {
  /**
   * Parses coordinates from a string format like "lat, lon" into separate latitude and longitude values
   * @param value - String containing latitude and longitude separated by a comma
   * @returns An object with parsed latitude and longitude values, or null if parsing fails
   */
  static parseCoordinates(value?: string): { latitude: number; longitude: number } | null {
    if (!value) return null;

    try {
      const coordParts = value.split(',').map(part => part.trim());
      if (coordParts.length !== 2) return null;

      const latitude = parseFloat(coordParts[0]);
      const longitude = parseFloat(coordParts[1]);

      if (isNaN(latitude) || isNaN(longitude)) return null;

      return { latitude, longitude };
    } catch (e) {
      console.error(`Unable to parse coordinates: "${value}"`);
      return null;
    }
  }

  /**
   * Formats coordinates as a string
   * @param latitude - Latitude value
   * @param longitude - Longitude value
   * @returns Formatted coordinate string
   */
  static formatCoordinates(latitude: number, longitude: number): string {
    return `${latitude}, ${longitude}`;
  }

  /**
   * Fetches coordinates from Mapbox using a mapbox ID
   * @param mapboxId - The Mapbox place ID
   * @returns Promise containing latitude and longitude coordinates
   */
  static async fetchCoordinatesFromMapbox(mapboxId: string): Promise<{ latitude: number; longitude: number } | null> {
    try {
      let sessionToken = sessionStorage.getItem('mapboxSessionToken');

      if (!sessionToken) {
        sessionToken = crypto.randomUUID();
        sessionStorage.setItem('mapboxSessionToken', sessionToken);
      }

      const response = await fetch(
        `/api/places/coordinates?mapboxId=${encodeURIComponent(mapboxId)}&sessionToken=${sessionToken}`
      );
      const data = await response.json();

      if (data && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
        return { latitude: data.latitude, longitude: data.longitude };
      }

      return null;
    } catch (error) {
      console.error('Failed to fetch coordinates from Mapbox:', error);
      return null;
    }
  }
}

export class GeoDate {
  static defaultFormat = 'MMM d, yyyy - h:mmaaa';
  static intervalDelimiter = '/';

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

  /**
   * Normalizes a stored date/time value to a full ISO string that `new Date()` can parse.
   * Handles RFC 3339 date-only ("2024-01-15"), time-only ("14:30:00Z"),
   * datetime ("2024-01-15T14:30:00Z"), and full ISO strings ("2024-01-15T14:30:00.000Z").
   */
  static toFullISOString(dateString: string): string {
    if (!dateString) return dateString;

    // Time-only: "HH:MM:SSZ" or "HH:MM:SS±HH:MM" — prefix with epoch date
    if (/^\d{2}:\d{2}:\d{2}/.test(dateString)) {
      return `1970-01-01T${dateString}`;
    }

    // Date-only: "YYYY-MM-DD" (no T or time portion)
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return `${dateString}T00:00:00.000Z`;
    }

    return dateString;
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
    const normalized = GeoDate.toFullISOString(dateString);
    const date = new Date(normalized);
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

  static toggleDateInterval = (dateIsoString?: string): string => {
    if (!dateIsoString) {
      return '';
    }

    if (this.isDateInterval(dateIsoString)) {
      const [startDateString] = dateIsoString.split(this.intervalDelimiter).map(d => d.trim());
      return startDateString;
    }
    return `${dateIsoString}${this.intervalDelimiter}${dateIsoString}`;
  };

  static isDateInterval = (dateString?: string): boolean => {
    if (!dateString) {
      return false;
    }

    return dateString.includes(this.intervalDelimiter);
  };

  static format = (dateIsoString: string, displayFormat?: string) => {
    try {
      const validatedFormat = this.validateFormat(displayFormat);

      if (this.isDateInterval(dateIsoString)) {
        const [startDateString, endDateString] = dateIsoString.split(this.intervalDelimiter).map(d => d.trim());

        const startDate = parseISO(GeoDate.toFullISOString(startDateString));
        const endDate = parseISO(GeoDate.toFullISOString(endDateString));

        const formattedStartDate = formatInTimeZone(startDate, 'UTC', validatedFormat);
        const formattedEndDate = formatInTimeZone(endDate, 'UTC', validatedFormat);

        return `${formattedStartDate} — ${formattedEndDate}`;
      }

      const date = parseISO(GeoDate.toFullISOString(dateIsoString));
      return formatInTimeZone(date, 'UTC', validatedFormat);
    } catch (e) {
      console.error(`Unable to format date: "${dateIsoString}" with format: "${displayFormat}".`, e);
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
  const serverAvatarUrl = Entities.avatar(entity?.relations) ?? null;
  const serverCoverUrl = Entities.cover(entity?.relations);

  const imageUrl = serverAvatarUrl ?? serverCoverUrl ?? '';
  const openGraphImageUrl = getOpenGraphImageUrl(imageUrl);
  const description = Entities.description(entity?.values ?? []);

  return {
    entityName,
    openGraphImageUrl,
    description,
  };
};

// Get the image hash from an image path
// e.g., https://gateway.lighthouse.storage/ipfs/HASH
// e.g., https://magenta-naval-crow-536.mypinata.cloud/files/HASH
// e.g., ipfs://HASH -> HASH
export const getImageHash = (value: string) => {
  // Handle Lighthouse gateway URLs
  if (value.startsWith(IPFS_GATEWAY_READ_PATH)) {
    const [, hash] = value.split(IPFS_GATEWAY_READ_PATH);
    return hash;
  }
  // Handle Pinata gateway URLs
  if (value.startsWith(PINATA_GATEWAY_READ_PATH)) {
    const [, hash] = value.split(PINATA_GATEWAY_READ_PATH);
    return hash;
  }
  // Handle ipfs:// protocol
  if (value.startsWith('ipfs://')) {
    const [, hash] = value.split('ipfs://');
    return hash;
  }
  // If the value does not contain a known gateway or protocol prefix, it already is a hash
  return value;
};

// Get the image URL from an image triple value
// this allows us to render images on the front-end based on a raw triple value
// e.g., ipfs://HASH -> https://example.mypinata.cloud/files/HASH
export const getImagePath = (value: string) => {
  // Use Pinata gateway as the primary source for IPFS images
  if (value?.startsWith('ipfs://')) {
    return `${PINATA_GATEWAY_READ_PATH}${getImageHash(value)}`;
    // The image likely resolves to an image resource at some URL
  } else if (value?.startsWith('http')) {
    return value;
  } else {
    // The image is likely a static, bundled path
    return value;
  }
};

// Get the fallback image URL (Lighthouse gateway) for when Pinata fails
export const getImagePathFallback = (value: string) => {
  if (value.startsWith('ipfs://')) {
    return `${IPFS_GATEWAY_READ_PATH}${getImageHash(value)}`;
  } else if (value.startsWith('http')) {
    return value;
  } else {
    return value;
  }
};

// Get the video hash from a video path
// Uses the same logic as image hash extraction
export const getVideoHash = getImageHash;

// Get the video URL from a video triple value
// this allows us to render videos on the front-end based on a raw triple value
// e.g., ipfs://HASH -> https://example.mypinata.cloud/files/HASH
export const getVideoPath = (value: string) => {
  // Use Pinata gateway as the primary source for IPFS videos
  if (value.startsWith('ipfs://')) {
    return `${PINATA_GATEWAY_READ_PATH}${getVideoHash(value)}`;
    // The video likely resolves to a video resource at some URL
  } else if (value.startsWith('http')) {
    return value;
  } else {
    // The video is likely a static, bundled path
    return value;
  }
};

// Get the fallback video URL (Lighthouse gateway) for when Pinata fails
export const getVideoPathFallback = (value: string) => {
  if (value.startsWith('ipfs://')) {
    return `${IPFS_GATEWAY_READ_PATH}${getVideoHash(value)}`;
  } else if (value.startsWith('http')) {
    return value;
  } else {
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

export function deriveProposalStatus(executedAt: string | null, endTime: number): ProposalStatus {
  if (executedAt) return 'ACCEPTED';
  const now = Math.floor(Date.now() / 1000);
  if (endTime < now) return 'REJECTED';
  return 'PROPOSED';
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

  return IdUtils.isValid(maybeEntityId);
};

/**
 * Validates that a string is a valid space ID (bytes16 hex format).
 * Space IDs are 32 hex characters without 0x prefix.
 */
export const validateSpaceId = (maybeSpaceId: string | null | undefined): maybeSpaceId is string => {
  if (typeof maybeSpaceId !== 'string') return false;

  return IdUtils.isValid(maybeSpaceId);
};

export const getTabSlug = (label: string) => {
  return label
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
};

//For pagination rendering
export enum PagesPaginationPlaceholder {
  skip = '...',
}

const MAX_VISIBLE_PAGES = 7;

export const getPaginationPages = (totalPages: number, activePage: number) => {
  if (totalPages <= MAX_VISIBLE_PAGES) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = [];

  // Always show first and second pages
  pages.push(1, 2);

  if (activePage <= 7) {
    // Current page is within first 7 pages: show 1 2 3 4 5 6 7 ... last
    for (let i = 3; i <= 7; i++) {
      pages.push(i);
    }
    pages.push(PagesPaginationPlaceholder.skip);
  } else if (activePage >= totalPages - 1) {
    // Current page is last or second-to-last: show 1 2 ... (last-5) through (last-1) last
    pages.push(PagesPaginationPlaceholder.skip);
    // Show at least 6 pages at the end (including the last page)
    const startPage = Math.max(totalPages - 5, 3); // Ensure we don't overlap with pages 1 and 2
    for (let i = startPage; i < totalPages; i++) {
      pages.push(i);
    }
  } else {
    // Current page is in the middle: show 1 2 ... (current-3) (current-2) (current-1) current ... last
    pages.push(PagesPaginationPlaceholder.skip);

    // Show 3 pages before current and current page itself
    for (let i = activePage - 3; i <= activePage; i++) {
      pages.push(i);
    }

    pages.push(PagesPaginationPlaceholder.skip);
  }

  // Always show last page
  pages.push(totalPages);
  return pages;
};

export function sortRelations(relations: Relation[]) {
  return [...relations].sort((a, b) => Position.compare(a.position ?? null, b.position ?? null));
}

export function sortRows(rows: Row[]) {
  return [...rows].sort((a, b) => Position.compare(a.position ?? null, b.position ?? null));
}
