import { Op } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { convertOpsToRenderables } from './ops-to-renderable';

// Raw bytes of the hyphenated UUIDs the ops carry, e.g. a126ca53-0c8e-48d5-b888-82c734c38935.
const ENTITY_BYTES = new Uint8Array([161, 38, 202, 83, 12, 142, 72, 213, 184, 136, 130, 199, 52, 195, 137, 53]);
const ENTITY_HEX = 'a126ca530c8e48d5b88882c734c38935';

const PROPERTY_BYTES = new Uint8Array([1, 65, 47, 131, 129, 137, 74, 177, 131, 101, 101, 199, 253, 53, 140, 193]);
const PROPERTY_HEX = '01412f8381894ab1836565c7fd358cc1';

const TO_BYTES = new Uint8Array([72, 74, 24, 197, 3, 10, 73, 156, 176, 242, 239, 88, 143, 241, 109, 80]);
const TO_HEX = '484a18c5030a499cb0f2ef588ff16d50';

describe('convertOpsToRenderables — GEO-2208 Uint8Array ID handling', () => {
  it('converts createEntity op IDs from raw bytes to hex strings', () => {
    const ops = [
      {
        type: 'createEntity',
        id: ENTITY_BYTES,
        values: [{ property: PROPERTY_BYTES, value: { type: 'text', value: 'hello' } }],
      },
    ] as unknown as Op[];

    const { values } = convertOpsToRenderables(ops, { spaceId: 'space-1', entityName: 'Test' });

    expect(values).toHaveLength(1);
    expect(values[0].entity.id).toBe(ENTITY_HEX);
    expect(values[0].property.id).toBe(PROPERTY_HEX);
  });

  it('converts createRelation op IDs from raw bytes to hex strings', () => {
    const ops = [
      {
        type: 'createRelation',
        id: ENTITY_BYTES,
        relationType: PROPERTY_BYTES,
        from: ENTITY_BYTES,
        to: TO_BYTES,
      },
    ] as unknown as Op[];

    const { relations } = convertOpsToRenderables(ops, { spaceId: 'space-1', entityName: 'Test' });

    expect(relations).toHaveLength(1);
    expect(relations[0].id).toBe(ENTITY_HEX);
    expect(relations[0].type.id).toBe(PROPERTY_HEX);
    expect(relations[0].fromEntity.id).toBe(ENTITY_HEX);
    expect(relations[0].toEntity.id).toBe(TO_HEX);
    expect(relations[0].toEntity.value).toBe(TO_HEX);
  });
});
