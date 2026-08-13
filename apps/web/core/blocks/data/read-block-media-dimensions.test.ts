import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { PROPERTY_HEIGHT_PIXELS_ID, PROPERTY_WIDTH_PIXELS_ID } from '~/core/constants';
import type { Entity } from '~/core/types';

import { readBlockMediaDimensions } from './read-block-media-dimensions';

const BLOCK_RELATION = 'blockrelation00000000000000000001';
const COVER_PROPERTY = 'cover00000000000000000000000001';
const NAME_PROPERTY = 'name000000000000000000000000001';

const shownColumn = (propertyId: string, overrides: Record<string, unknown> = {}) =>
  ({
    type: { id: SystemIds.PROPERTIES },
    toEntity: { id: propertyId },
    ...overrides,
  }) as never;

const dimensionValue = (propertyId: string, value: string, overrides: Record<string, unknown> = {}) =>
  ({ property: { id: propertyId }, value, spaceId: 'some-other-space', ...overrides }) as never;

const entity = (id: string, values: unknown[] = [], relations: unknown[] = []) =>
  ({ id, values, relations }) as unknown as Entity;

describe('readBlockMediaDimensions', () => {
  it('reads width and height off the block’s shown media column', () => {
    const dimensions = readBlockMediaDimensions(BLOCK_RELATION, [
      entity(BLOCK_RELATION, [], [shownColumn(COVER_PROPERTY)]),
      entity(COVER_PROPERTY, [
        dimensionValue(PROPERTY_WIDTH_PIXELS_ID, '1080'),
        dimensionValue(PROPERTY_HEIGHT_PIXELS_ID, '1920'),
      ]),
    ]);

    expect(dimensions).toEqual({ width: 1080, height: 1920, aspectRatio: '1080 / 1920' });
  });

  it('reads a height-only configuration', () => {
    const dimensions = readBlockMediaDimensions(BLOCK_RELATION, [
      entity(BLOCK_RELATION, [], [shownColumn(COVER_PROPERTY)]),
      entity(COVER_PROPERTY, [dimensionValue(PROPERTY_HEIGHT_PIXELS_ID, '320')]),
    ]);

    expect(dimensions).toEqual({ width: null, height: 320, aspectRatio: null });
  });

  it('skips shown columns that configure no size', () => {
    const dimensions = readBlockMediaDimensions(BLOCK_RELATION, [
      entity(BLOCK_RELATION, [], [shownColumn(NAME_PROPERTY), shownColumn(COVER_PROPERTY)]),
      entity(NAME_PROPERTY, [dimensionValue(SystemIds.NAME_PROPERTY, 'Name')]),
      entity(COVER_PROPERTY, [
        dimensionValue(PROPERTY_WIDTH_PIXELS_ID, '600'),
        dimensionValue(PROPERTY_HEIGHT_PIXELS_ID, '600'),
      ]),
    ]);

    expect(dimensions).toEqual({ width: 600, height: 600, aspectRatio: '600 / 600' });
  });

  it('does not filter dimension values by the page’s space', () => {
    // Properties are defined in whatever space owns them, which is rarely the space of the page
    // rendering the block. Scoping the read to the page's space finds nothing.
    const dimensions = readBlockMediaDimensions(BLOCK_RELATION, [
      entity(BLOCK_RELATION, [], [shownColumn(COVER_PROPERTY)]),
      entity(COVER_PROPERTY, [
        dimensionValue(PROPERTY_WIDTH_PIXELS_ID, '4', { spaceId: 'root-space' }),
        dimensionValue(PROPERTY_HEIGHT_PIXELS_ID, '3', { spaceId: 'root-space' }),
      ]),
    ]);

    expect(dimensions).toEqual({ width: 4, height: 3, aspectRatio: '4 / 3' });
  });

  it('ignores deleted shown columns and deleted dimension values', () => {
    expect(
      readBlockMediaDimensions(BLOCK_RELATION, [
        entity(BLOCK_RELATION, [], [shownColumn(COVER_PROPERTY, { isDeleted: true })]),
        entity(COVER_PROPERTY, [dimensionValue(PROPERTY_HEIGHT_PIXELS_ID, '320')]),
      ])
    ).toEqual({ width: null, height: null, aspectRatio: null });

    expect(
      readBlockMediaDimensions(BLOCK_RELATION, [
        entity(BLOCK_RELATION, [], [shownColumn(COVER_PROPERTY)]),
        entity(COVER_PROPERTY, [dimensionValue(PROPERTY_HEIGHT_PIXELS_ID, '320', { isDeleted: true })]),
      ])
    ).toEqual({ width: null, height: null, aspectRatio: null });
  });

  it('falls back to the view default when the property entity was never fetched', () => {
    const dimensions = readBlockMediaDimensions(BLOCK_RELATION, [
      entity(BLOCK_RELATION, [], [shownColumn(COVER_PROPERTY)]),
    ]);

    expect(dimensions).toEqual({ width: null, height: null, aspectRatio: null });
  });

  it('falls back to the view default for an unknown block', () => {
    expect(readBlockMediaDimensions(BLOCK_RELATION, [])).toEqual({ width: null, height: null, aspectRatio: null });
  });
});
