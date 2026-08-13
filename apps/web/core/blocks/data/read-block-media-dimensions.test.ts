import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import {
  PROPERTY_HEIGHT_PIXELS_ID,
  PROPERTY_WIDTH_PIXELS_ID,
  RENDERABLE_TYPE_PROPERTY,
  VIDEO_RENDERABLE_TYPE,
} from '~/core/constants';
import type { Entity } from '~/core/types';

import { readBlockMediaDimensions } from './read-block-media-dimensions';

const BLOCK_RELATION = 'blockrelation00000000000000000001';
const COVER = 'cover00000000000000000000000001';
const VIDEO = 'video00000000000000000000000001';
const AUTHOR = 'author0000000000000000000000001';

const NO_DIMENSIONS = { width: null, height: null, aspectRatio: null };

const shownColumn = (propertyId: string, overrides: Record<string, unknown> = {}) =>
  ({ type: { id: SystemIds.PROPERTIES }, toEntity: { id: propertyId }, position: 'a0', ...overrides }) as never;

const renderableType = (typeId: string) =>
  ({ type: { id: RENDERABLE_TYPE_PROPERTY }, toEntity: { id: typeId } }) as never;

const value = (propertyId: string, raw: string, overrides: Record<string, unknown> = {}) =>
  ({ property: { id: propertyId }, value: raw, spaceId: 'ontology-space', ...overrides }) as never;

const size = (width: number | null, height: number | null) =>
  [
    ...(width == null ? [] : [value(PROPERTY_WIDTH_PIXELS_ID, String(width))]),
    ...(height == null ? [] : [value(PROPERTY_HEIGHT_PIXELS_ID, String(height))]),
  ] as never[];

const entity = (id: string, values: unknown[] = [], relations: unknown[] = []) =>
  ({ id, values, relations }) as unknown as Entity;

/** An Image-rendered property, which is what `resolveMainMediaProperty` looks for. */
const imageProperty = (id: string, values: unknown[] = []) => entity(id, values, [renderableType(SystemIds.IMAGE)]);
const videoProperty = (id: string, values: unknown[] = []) =>
  entity(id, values, [renderableType(VIDEO_RENDERABLE_TYPE)]);

describe('readBlockMediaDimensions', () => {
  it('reads width and height off the block’s shown media column', () => {
    const dimensions = readBlockMediaDimensions(BLOCK_RELATION, [
      entity(BLOCK_RELATION, [], [shownColumn(COVER)]),
      imageProperty(COVER, size(1080, 1920)),
    ]);

    expect(dimensions).toEqual({ width: 1080, height: 1920, aspectRatio: '1080 / 1920' });
  });

  it('reads a video column’s dimensions', () => {
    const dimensions = readBlockMediaDimensions(BLOCK_RELATION, [
      entity(BLOCK_RELATION, [], [shownColumn(VIDEO)]),
      videoProperty(VIDEO, size(540, 820)),
    ]);

    expect(dimensions).toEqual({ width: 540, height: 820, aspectRatio: '540 / 820' });
  });

  it('reads a height-only configuration', () => {
    const dimensions = readBlockMediaDimensions(BLOCK_RELATION, [
      entity(BLOCK_RELATION, [], [shownColumn(COVER)]),
      imageProperty(COVER, size(null, 320)),
    ]);

    expect(dimensions).toEqual({ width: null, height: 320, aspectRatio: null });
  });

  it('resolves the property id the way the client does, preferring toEntity.value', () => {
    // Migrated shown-column relations carry the property id in `value`; reconstructing it from
    // `toEntity.id` alone finds a different entity than the one the client renders.
    const dimensions = readBlockMediaDimensions(BLOCK_RELATION, [
      entity(
        BLOCK_RELATION,
        [],
        [shownColumn('stale-target-id', { toEntity: { id: 'stale-target-id', value: COVER } })]
      ),
      imageProperty(COVER, size(4, 3)),
    ]);

    expect(dimensions).toEqual({ width: 4, height: 3, aspectRatio: '4 / 3' });
  });

  it('picks the first media column by position, not by relation order', () => {
    const dimensions = readBlockMediaDimensions(BLOCK_RELATION, [
      entity(BLOCK_RELATION, [], [shownColumn(VIDEO, { position: 'a5' }), shownColumn(COVER, { position: 'a1' })]),
      imageProperty(COVER, size(4, 3)),
      videoProperty(VIDEO, size(16, 9)),
    ]);

    expect(dimensions).toEqual({ width: 4, height: 3, aspectRatio: '4 / 3' });
  });

  it('stops at the first media column even when a later one configures a size and it does not', () => {
    // `resolveMainMediaProperty` returns the first Image/Video column outright; reading past it
    // to find one that happens to carry dimensions renders the grid at a ratio no card uses.
    const dimensions = readBlockMediaDimensions(BLOCK_RELATION, [
      entity(BLOCK_RELATION, [], [shownColumn(COVER, { position: 'a1' }), shownColumn(VIDEO, { position: 'a5' })]),
      imageProperty(COVER),
      videoProperty(VIDEO, size(16, 9)),
    ]);

    expect(dimensions).toEqual(NO_DIMENSIONS);
  });

  it('skips shown columns that are not rendered as media', () => {
    const dimensions = readBlockMediaDimensions(BLOCK_RELATION, [
      entity(BLOCK_RELATION, [], [shownColumn(AUTHOR, { position: 'a1' }), shownColumn(COVER, { position: 'a5' })]),
      // A plain relation property that happens to carry pixel values must not win.
      entity(AUTHOR, size(999, 999)),
      imageProperty(COVER, size(600, 600)),
    ]);

    expect(dimensions).toEqual({ width: 600, height: 600, aspectRatio: '600 / 600' });
  });

  it('skips the implicit Name column', () => {
    const dimensions = readBlockMediaDimensions(BLOCK_RELATION, [
      entity(
        BLOCK_RELATION,
        [],
        [shownColumn(SystemIds.NAME_PROPERTY, { position: 'a1' }), shownColumn(COVER, { position: 'a5' })]
      ),
      imageProperty(SystemIds.NAME_PROPERTY, size(999, 999)),
      imageProperty(COVER, size(600, 600)),
    ]);

    expect(dimensions).toEqual({ width: 600, height: 600, aspectRatio: '600 / 600' });
  });

  it('does not filter dimension values by the page’s space', () => {
    // Properties are defined in whatever space owns them, which is rarely the space of the page
    // rendering the block. Scoping the read to the page's space finds nothing.
    const dimensions = readBlockMediaDimensions(BLOCK_RELATION, [
      entity(BLOCK_RELATION, [], [shownColumn(COVER)]),
      imageProperty(COVER, [
        value(PROPERTY_WIDTH_PIXELS_ID, '4', { spaceId: 'root-space' }),
        value(PROPERTY_HEIGHT_PIXELS_ID, '3', { spaceId: 'root-space' }),
      ]),
    ]);

    expect(dimensions).toEqual({ width: 4, height: 3, aspectRatio: '4 / 3' });
  });

  it('ignores deleted shown columns and deleted dimension values', () => {
    expect(
      readBlockMediaDimensions(BLOCK_RELATION, [
        entity(BLOCK_RELATION, [], [shownColumn(COVER, { isDeleted: true })]),
        imageProperty(COVER, size(null, 320)),
      ])
    ).toEqual(NO_DIMENSIONS);

    expect(
      readBlockMediaDimensions(BLOCK_RELATION, [
        entity(BLOCK_RELATION, [], [shownColumn(COVER)]),
        imageProperty(COVER, [value(PROPERTY_HEIGHT_PIXELS_ID, '320', { isDeleted: true })]),
      ])
    ).toEqual(NO_DIMENSIONS);
  });

  it('falls back to the view default when the property entity was never fetched', () => {
    expect(readBlockMediaDimensions(BLOCK_RELATION, [entity(BLOCK_RELATION, [], [shownColumn(COVER)])])).toEqual(
      NO_DIMENSIONS
    );
  });

  it('falls back to the view default for an unknown block', () => {
    expect(readBlockMediaDimensions(BLOCK_RELATION, [])).toEqual(NO_DIMENSIONS);
  });
});
