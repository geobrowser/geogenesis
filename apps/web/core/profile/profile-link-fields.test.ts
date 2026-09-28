import { describe, expect, it } from 'vitest';

import type { SchemaPropertyGroup } from '~/core/database/entities';
import type { Property } from '~/core/types';

import { changedLinkFields, profileLinkFields } from './profile-link-fields';
import { LINKEDIN_PROPERTY, WEBSITE_PROPERTY, X_PROPERTY } from './profile-links';

/**
 * What a person can put under Links, taken from the type (GEO-2859).
 *
 * The rail's display formats and the Person type's group had already drifted:
 * the formats named GitHub, which the group does not carry, and the group names
 * Website, which the formats could not render — so a Website written to a
 * profile had nowhere to appear. A hardcoded editor would have been a third list
 * to drift from the other two.
 */
const group = (over: Partial<SchemaPropertyGroup> = {}): SchemaPropertyGroup => ({
  id: 'group-links',
  name: 'Links',
  collapsed: false,
  propertyIds: [X_PROPERTY, WEBSITE_PROPERTY, LINKEDIN_PROPERTY],
  source: 'type',
  ...over,
});

const schema = [
  { id: X_PROPERTY, name: 'X' },
  { id: WEBSITE_PROPERTY, name: 'Website' },
  { id: LINKEDIN_PROPERTY, name: 'LinkedIn' },
] as Property[];

describe('profileLinkFields', () => {
  it('offers every property the group names, set and unset alike', () => {
    const fields = profileLinkFields({
      propertyGroups: [group()],
      schema,
      values: [{ property: { id: X_PROPERTY }, value: 'journeyingjew' }],
    });

    // The reason to open the editor is usually the one that is missing.
    expect(fields.map(field => [field.label, field.value])).toEqual([
      ['X', 'journeyingjew'],
      ['Website', ''],
      ['LinkedIn', ''],
    ]);
  });

  it('carries the format for a property the card knows how to render', () => {
    const [x] = profileLinkFields({ propertyGroups: [group()], schema, values: [] });

    expect(x.format?.('them')).toBe('https://x.com/them');
  });

  it('offers nothing when the type has no Links group', () => {
    // A Person type without one is not a reason to invent fields.
    expect(profileLinkFields({ propertyGroups: [group({ name: 'Identity' })], schema, values: [] })).toEqual([]);
  });

  it('finds the group however its name is cased or padded', () => {
    const fields = profileLinkFields({ propertyGroups: [group({ name: '  links ' })], schema, values: [] });

    expect(fields).toHaveLength(3);
  });

  it('draws one input per property even when the group lists it twice', () => {
    // A group's relations exist per space, so the same property arrives more than
    // once — two inputs would write to one value and fight.
    const fields = profileLinkFields({
      propertyGroups: [group({ propertyIds: [X_PROPERTY, X_PROPERTY] })],
      schema,
      values: [],
    });

    expect(fields).toHaveLength(1);
  });

  it('matches values to properties however the ids are spelled', () => {
    const dashed = `${X_PROPERTY.slice(0, 8)}-${X_PROPERTY.slice(8, 12)}-${X_PROPERTY.slice(12, 16)}-${X_PROPERTY.slice(16, 20)}-${X_PROPERTY.slice(20)}`;
    const fields = profileLinkFields({
      propertyGroups: [group()],
      schema,
      values: [{ property: { id: dashed }, value: 'them' }],
    });

    expect(fields[0].value).toBe('them');
  });

  it('names a property the formats do not know from the schema', () => {
    const fields = profileLinkFields({
      propertyGroups: [group({ propertyIds: ['unknown-prop'] })],
      schema: [{ id: 'unknown-prop', name: 'Mastodon' }] as Property[],
      values: [],
    });

    expect(fields[0].label).toBe('Mastodon');
    expect(fields[0].format).toBeUndefined();
  });
});

describe('changedLinkFields', () => {
  const fields = [
    { propertyId: X_PROPERTY, label: 'X', value: 'them' },
    { propertyId: WEBSITE_PROPERTY, label: 'Website', value: '' },
  ];

  it('finds nothing in an untouched draft', () => {
    expect(changedLinkFields(fields, {})).toEqual([]);
  });

  it('finds a field that was filled in', () => {
    expect(changedLinkFields(fields, { [WEBSITE_PROPERTY]: 'example.com' })).toHaveLength(1);
  });

  it('finds a field that was cleared', () => {
    expect(changedLinkFields(fields, { [X_PROPERTY]: '' })).toHaveLength(1);
  });

  it('ignores whitespace nobody meant to type', () => {
    // A publish runs to tens of seconds; a trailing space is not worth one.
    expect(changedLinkFields(fields, { [X_PROPERTY]: ' them ' })).toEqual([]);
  });
});
