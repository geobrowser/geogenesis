export const MAX_RESULT_ENTRIES = 10;
export const MAX_ATTRIBUTE_VALUE_CHARS = 300;

export function truncateText(value: string, max = MAX_ATTRIBUTE_VALUE_CHARS): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

export function limitEntries<T>(items: readonly T[], max = MAX_RESULT_ENTRIES): T[] {
  return items.slice(0, max);
}

const DASHLESS_UUID = /^[a-f0-9]{32}$/i;
const DASHED_UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function isEntityId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return DASHLESS_UUID.test(value) || DASHED_UUID.test(value);
}

export function normalizeEntityId(value: string): string {
  return value.replace(/-/g, '').toLowerCase();
}
