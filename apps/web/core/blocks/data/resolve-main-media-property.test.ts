import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { Property } from '~/core/types';

import {
  isBlockMediaProperty,
  parsePositivePixelDimension,
  resolveMainMediaProperty,
} from './resolve-main-media-property';

function prop(partial: Partial<Property> & Pick<Property, 'id'>): Property {
  return {
    name: partial.name ?? null,
    dataType: partial.dataType ?? 'RELATION',
    renderableTypeStrict: partial.renderableTypeStrict ?? null,
    ...partial,
  };
}

describe('isBlockMediaProperty', () => {
  it('returns true for IMAGE and VIDEO', () => {
    expect(isBlockMediaProperty(prop({ id: 'a', renderableTypeStrict: 'IMAGE' }))).toBe(true);
    expect(isBlockMediaProperty(prop({ id: 'b', renderableTypeStrict: 'VIDEO' }))).toBe(true);
  });

  it('returns false otherwise', () => {
    expect(isBlockMediaProperty(prop({ id: 'c', renderableTypeStrict: 'URL' }))).toBe(false);
    expect(isBlockMediaProperty(undefined)).toBe(false);
  });
});

describe('resolveMainMediaProperty', () => {
  const cover = prop({ id: SystemIds.COVER_PROPERTY, name: 'Cover', renderableTypeStrict: 'IMAGE' });
  const photo = prop({ id: 'photo-prop', name: 'Photo', renderableTypeStrict: 'IMAGE' });
  const clip = prop({ id: 'video-prop', name: 'Clip', renderableTypeStrict: 'VIDEO' });
  const description = prop({
    id: SystemIds.DESCRIPTION_PROPERTY,
    name: 'Description',
    dataType: 'TEXT',
  });

  const properties = {
    [cover.id]: cover,
    [photo.id]: photo,
    [clip.id]: clip,
    [description.id]: description,
  };

  it('returns the first IMAGE/VIDEO in shown order', () => {
    expect(resolveMainMediaProperty([SystemIds.NAME_PROPERTY, description.id, photo.id, cover.id], properties)).toEqual(
      { propertyId: photo.id, kind: 'IMAGE', name: 'Photo' }
    );
  });

  it('prefers an earlier VIDEO over a later IMAGE', () => {
    expect(resolveMainMediaProperty([clip.id, photo.id], properties)).toEqual({
      propertyId: clip.id,
      kind: 'VIDEO',
      name: 'Clip',
    });
  });

  it('returns null when no media property is shown', () => {
    expect(resolveMainMediaProperty([SystemIds.NAME_PROPERTY, description.id], properties)).toBeNull();
  });
});

describe('parsePositivePixelDimension', () => {
  it('parses positive numbers', () => {
    expect(parsePositivePixelDimension('320')).toBe(320);
    expect(parsePositivePixelDimension('180.5')).toBe(180.5);
  });

  it('rejects invalid values', () => {
    expect(parsePositivePixelDimension(undefined)).toBeNull();
    expect(parsePositivePixelDimension('')).toBeNull();
    expect(parsePositivePixelDimension('0')).toBeNull();
    expect(parsePositivePixelDimension('-10')).toBeNull();
    expect(parsePositivePixelDimension('abc')).toBeNull();
  });
});
