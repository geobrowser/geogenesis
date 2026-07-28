import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { EntityId } from '~/core/io/substream-schema';
import type { Relation, Value } from '~/core/types';

import { pickImage, pickRelationBySpace, pickValueBySpace } from './ranking-entry-pick';

// Real space IDs from getSpaceRank: Root=0, Crypto=2, Software=5.
const ROOT_SPACE = 'a19c345ab9866679b001d7d2138d88a1';
const CRYPTO_SPACE = 'c9f267dcb0d270718c2a3c45a64afd32';
const SOFTWARE_SPACE = '9b611b848b12491b9b6b43f3cf019b8b';
// A space the rank table doesn't know about — UNRANKED, used as the "current" viewing space.
const UNRANKED_SPACE = '11111111111111111111111111111111';

const AVATAR_TYPE = EntityId(ContentIds.AVATAR_PROPERTY);
const COVER_TYPE = EntityId(SystemIds.COVER_PROPERTY);

function value(propertyId: string, spaceId: string, str: string): Value {
  return {
    property: { id: propertyId },
    value: str,
    spaceId,
  } as Value;
}

function relation(typeId: string, spaceId: string, toValue: string): Relation {
  return {
    type: { id: typeId },
    spaceId,
    toEntity: { value: toValue },
  } as Relation;
}

describe('pickValueBySpace', () => {
  it('returns the current-space value when present', () => {
    const values = [
      value(SystemIds.NAME_PROPERTY, ROOT_SPACE, 'Root name'),
      value(SystemIds.NAME_PROPERTY, UNRANKED_SPACE, 'Current name'),
    ];
    expect(pickValueBySpace(values, SystemIds.NAME_PROPERTY, UNRANKED_SPACE)).toBe('Current name');
  });

  it('falls back to the highest-ranked space when current space has no value', () => {
    const values = [
      value(SystemIds.NAME_PROPERTY, SOFTWARE_SPACE, 'Software name'),
      value(SystemIds.NAME_PROPERTY, CRYPTO_SPACE, 'Crypto name'),
      value(SystemIds.NAME_PROPERTY, ROOT_SPACE, 'Root name'),
    ];
    expect(pickValueBySpace(values, SystemIds.NAME_PROPERTY, UNRANKED_SPACE)).toBe('Root name');
  });

  it('falls back when the current-space value is whitespace-only', () => {
    const values = [
      value(SystemIds.NAME_PROPERTY, UNRANKED_SPACE, '   '),
      value(SystemIds.NAME_PROPERTY, CRYPTO_SPACE, 'Crypto name'),
    ];
    expect(pickValueBySpace(values, SystemIds.NAME_PROPERTY, UNRANKED_SPACE)).toBe('Crypto name');
  });

  it('returns trimmed text', () => {
    const values = [value(SystemIds.NAME_PROPERTY, UNRANKED_SPACE, '  Paris  ')];
    expect(pickValueBySpace(values, SystemIds.NAME_PROPERTY, UNRANKED_SPACE)).toBe('Paris');
  });

  it('returns null when no values exist for the property', () => {
    const values = [value(SystemIds.DESCRIPTION_PROPERTY, ROOT_SPACE, 'unrelated')];
    expect(pickValueBySpace(values, SystemIds.NAME_PROPERTY, UNRANKED_SPACE)).toBeNull();
  });

  it('ignores values for other properties', () => {
    const values = [
      value(SystemIds.DESCRIPTION_PROPERTY, UNRANKED_SPACE, 'Wrong property'),
      value(SystemIds.NAME_PROPERTY, CRYPTO_SPACE, 'Right property'),
    ];
    expect(pickValueBySpace(values, SystemIds.NAME_PROPERTY, UNRANKED_SPACE)).toBe('Right property');
  });
});

describe('pickRelationBySpace', () => {
  it('returns the current-space relation when present', () => {
    const relations = [
      relation(AVATAR_TYPE, ROOT_SPACE, 'ipfs://root'),
      relation(AVATAR_TYPE, UNRANKED_SPACE, 'ipfs://current'),
    ];
    expect(pickRelationBySpace(relations, AVATAR_TYPE, UNRANKED_SPACE)?.spaceId).toBe(UNRANKED_SPACE);
  });

  it('falls back to the highest-ranked space when the current space has none', () => {
    const relations = [
      relation(AVATAR_TYPE, SOFTWARE_SPACE, 'ipfs://software'),
      relation(AVATAR_TYPE, ROOT_SPACE, 'ipfs://root'),
      relation(AVATAR_TYPE, CRYPTO_SPACE, 'ipfs://crypto'),
    ];
    expect(pickRelationBySpace(relations, AVATAR_TYPE, UNRANKED_SPACE)?.spaceId).toBe(ROOT_SPACE);
  });
});

describe('pickImage', () => {
  it('prefers a current-space avatar over a ranked-space avatar', () => {
    const relations = [
      relation(AVATAR_TYPE, ROOT_SPACE, 'ipfs://root-avatar'),
      relation(AVATAR_TYPE, UNRANKED_SPACE, 'ipfs://current-avatar'),
    ];
    expect(pickImage(relations, UNRANKED_SPACE)).toBe('ipfs://current-avatar');
  });

  it('prefers a current-space cover over a ranked-space avatar', () => {
    const relations = [
      relation(AVATAR_TYPE, ROOT_SPACE, 'ipfs://root-avatar'),
      relation(COVER_TYPE, UNRANKED_SPACE, 'ipfs://current-cover'),
    ];
    expect(pickImage(relations, UNRANKED_SPACE)).toBe('ipfs://current-cover');
  });

  it('falls back to a ranked-space avatar before a ranked-space cover', () => {
    const relations = [
      relation(COVER_TYPE, ROOT_SPACE, 'ipfs://root-cover'),
      relation(AVATAR_TYPE, CRYPTO_SPACE, 'ipfs://crypto-avatar'),
    ];
    expect(pickImage(relations, UNRANKED_SPACE)).toBe('ipfs://crypto-avatar');
  });

  it('falls back to a ranked-space avatar when the current-space avatar has an empty value', () => {
    const relations = [
      relation(AVATAR_TYPE, UNRANKED_SPACE, ''),
      relation(AVATAR_TYPE, CRYPTO_SPACE, 'ipfs://crypto-avatar'),
    ];
    expect(pickImage(relations, UNRANKED_SPACE)).toBe('ipfs://crypto-avatar');
  });

  it('returns null when no relations have a value', () => {
    const relations = [relation(AVATAR_TYPE, UNRANKED_SPACE, ''), relation(COVER_TYPE, ROOT_SPACE, '')];
    expect(pickImage(relations, UNRANKED_SPACE)).toBeNull();
  });

  it('returns null when there are no avatar or cover relations', () => {
    expect(pickImage([], UNRANKED_SPACE)).toBeNull();
  });
});
