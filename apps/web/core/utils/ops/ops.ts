import { Id, Op } from '@geoprotocol/geo-sdk';

/** Convert hex ID string to Uint8Array (16 bytes). */
function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.replace(/-/g, '');
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return bytes;
}

interface ValueParam {
  property: string;
  value: {
    type: 'text' | 'boolean' | 'integer' | 'float' | 'point' | 'date' | 'time' | 'datetime' | 'schedule';
    value?: string | number | boolean;
    lon?: number;
    lat?: number;
    language?: string;
    unit?: string;
  };
}

interface CreateArgs {
  entity: string;
  value: ValueParam;
}

// English language ID constant - matches SDK's internal value
const ENGLISH_LANGUAGE_ID = '090adac0fca4822e8e719263e67620ec';

export function create({ entity, value }: CreateArgs): Op {
  const sdkValue: Record<string, unknown> = {
    type: value.value.type,
  };

  if (value.value.type === 'point') {
    sdkValue.lon = value.value.lon;
    sdkValue.lat = value.value.lat;
  } else if (value.value.value !== undefined) {
    sdkValue.value = value.value.value;
  }

  if (value.value.type === 'text') {
    sdkValue.language = hexToBytes(value.value.language ?? ENGLISH_LANGUAGE_ID);
  }

  if (value.value.unit) {
    sdkValue.unit = hexToBytes(value.value.unit);
  }

  return {
    type: 'createEntity',
    id: hexToBytes(Id(entity)),
    values: [
      {
        property: hexToBytes(Id(value.property)),
        value: sdkValue,
      },
    ],
  } as unknown as Op;
}

export const Ops = {
  create,
};
