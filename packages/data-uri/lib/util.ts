import {Value} from '.';

export function displayData(value: Value): string {
  switch (typeof value) {
    case 'boolean':
    case 'number':
      return value.toString();
    case 'string':
      return `"${value.toString()}"`;
  }
  if (value == null) return 'null';
  if (value instanceof Uint8Array) return toHex(value);
  if (Array.isArray(value)) return `[${value.map(displayData).join(', ')}]`;
  const keys = Object.keys(value).sort(keySort);
  return `{${keys.map(k => `"${k}": ${displayData(value[k])}`).join(', ')}}`;
}

export const toHex = (bytes: Uint8Array, prefix: boolean = true): string =>
  toStrRadix(bytes, prefix ? '0x' : '', 16, 2);

export const toBin = (bytes: Uint8Array, prefix: boolean = true): string =>
  toStrRadix(bytes, prefix ? '0b' : '', 2, 8);

const toStrRadix = (
  bytes: Uint8Array,
  prefix: string,
  radix: number,
  pad: number
): string =>
  prefix +
  (bytes.length === 0
    ? '0'
    : Array.from(bytes)
        .map(b => b.toString(radix).padStart(pad, '0'))
        .join(''));

export const keySort = (a: string, b: string): number => {
  if (a.length < b.length) return -1;
  if (a.length > b.length) return +1;
  for (let i = 0; i < a.length; i++) {
    if (a.charAt(i) < b.charAt(i)) return -1;
    if (a.charAt(i) > b.charAt(i)) return +1;
  }
  return 0;
};
