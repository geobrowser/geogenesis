import { describe, expect, it } from 'vitest';

import { LINKEDIN_PROPERTY, X_PROPERTY } from '~/core/profile/profile-links';

import { linkValueRows, placeholderFor } from './profile-links-editor';

/**
 * What a links edit writes (GEO-2859).
 *
 * The rail hides a link with no handle, so a cleared field has to *delete* its
 * row rather than store an empty string — otherwise the profile keeps a value
 * nobody can see and the next edit has to account for it. `publish` routes
 * `isDeleted` to `storage.values.delete`.
 */
const fields = [
  { propertyId: X_PROPERTY, label: 'X', value: 'them', format: (handle: string) => `https://x.com/${handle}` },
  { propertyId: LINKEDIN_PROPERTY, label: 'LinkedIn', value: '' },
];

const rows = (draft: Record<string, string>) =>
  linkValueRows({ fields, draft, entityId: 'person', entityName: 'Preston Mantel', spaceId: 'space' });

describe('linkValueRows', () => {
  it('writes nothing for an untouched draft', () => {
    expect(rows({})).toEqual([]);
  });

  it('writes a filled-in field as a value', () => {
    const [row] = rows({ [LINKEDIN_PROPERTY]: 'preston' });

    expect(row.value).toBe('preston');
    expect(row.isDeleted).toBe(false);
    expect(row.property.dataType).toBe('TEXT');
  });

  it('deletes a cleared field rather than storing an empty string', () => {
    const [row] = rows({ [X_PROPERTY]: '' });

    expect(row.isDeleted).toBe(true);
  });

  it('trims what it writes', () => {
    expect(rows({ [LINKEDIN_PROPERTY]: '  preston  ' })[0].value).toBe('preston');
  });

  it('writes nothing when only whitespace changed', () => {
    expect(rows({ [X_PROPERTY]: ' them ' })).toEqual([]);
  });

  // Derived from entity, property and space, so editing the same link twice
  // addresses one row rather than stacking two.
  it('gives the same field the same row id every time', () => {
    expect(rows({ [X_PROPERTY]: 'a' })[0].id).toBe(rows({ [X_PROPERTY]: 'b' })[0].id);
  });

  it('gives different fields different row ids', () => {
    const both = rows({ [X_PROPERTY]: 'a', [LINKEDIN_PROPERTY]: 'b' });

    expect(both).toHaveLength(2);
    expect(both[0].id).not.toBe(both[1].id);
  });
});

describe('placeholderFor', () => {
  it('shows what the card will do with what is typed', () => {
    expect(placeholderFor(fields[0])).toBe('x.com/handle');
  });

  it('falls back to the label where there is no format to describe', () => {
    // A property the card cannot turn into a URL should not invent a convention.
    expect(placeholderFor(fields[1])).toBe('LinkedIn');
  });
});
