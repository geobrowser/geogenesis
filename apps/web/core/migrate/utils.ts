import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

import { TripleWithDateValue, TripleWithStringValue, TripleWithUrlValue } from '../types';
import { GeoDate } from '../utils/utils';

dayjs.extend(utc);

export function migrateStringTripleToDateTriple(triple: TripleWithStringValue): TripleWithDateValue | null {
  // We only attempt to convert dates that are in the format MM/DD/YYYY. There is
  // an infinite number of potential date formats (and formatting errors) with a
  // raw string. The simplest is to choose a single format and delete any triples
  // that don't match the correct format.
  const date = dayjs.utc(triple.value.value, 'MM/DD/YYYY');

  if (!date.isValid()) {
    return null;
  }

  const dateValue = GeoDate.toISOStringUTC({
    day: date.date().toString(),
    month: (date.month() + 1).toString(),
    year: date.year().toString(),
    hour: '0',
    minute: '0',
  });

  return {
    ...triple,
    value: {
      ...triple.value,
      type: 'TIME',
      value: dateValue,
    },
  };
}

export function migrateDateTripleToStringTriple(triple: TripleWithDateValue): TripleWithStringValue {
  const { day, month, year } = GeoDate.fromISOStringUTC(triple.value.value);

  return {
    ...triple,
    value: {
      ...triple.value,
      type: 'TEXT',
      value: `${month}/${day}/${year}`,
    },
  };
}

export function migrateStringTripleToUrlTriple(triple: TripleWithStringValue): TripleWithUrlValue | null {
  const isUrl = triple.value.value.startsWith('http://') || triple.value.value.startsWith('https://');

  if (!isUrl) {
    return null;
  }

  return {
    ...triple,
    value: {
      ...triple.value,
      type: 'URL',
      value: triple.value.value,
    },
  };
}

export function migrateUrlTripleToStringTriple(triple: TripleWithUrlValue): TripleWithStringValue {
  return {
    ...triple,
    value: {
      ...triple.value,
      type: 'TEXT',
      value: triple.value.value,
    },
  };
}
