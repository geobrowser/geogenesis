import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk';

import { describe, expect, it } from 'vitest';

import { FILEBASE_GATEWAY_READ_PATH } from '~/core/constants';
import { Relation } from '~/core/types';

import { OG_IMAGE_PROPERTY } from './constants';
import { ogShareImageSrc, toSatoriImageSrc } from './og-share-image';

const imageRelation = (propertyId: string, url: string): Relation => ({
  id: `relation-${propertyId}`,
  entityId: 'relation-entity',
  type: { id: propertyId, name: 'Image property' },
  fromEntity: { id: 'entity-1', name: 'Entity' },
  toEntity: { id: `image-${url}`, name: 'Image', value: url },
  renderableType: 'IMAGE',
  spaceId: 'space-1',
});

const OG = (url: string) => imageRelation(OG_IMAGE_PROPERTY, url);
const COVER = imageRelation(SystemIds.COVER_PROPERTY, 'ipfs://QmCover');
const AVATAR = imageRelation(ContentIds.AVATAR_PROPERTY, 'ipfs://QmAvatar');

describe('toSatoriImageSrc', () => {
  it('resolves ipfs to a gateway URL the card can fetch', () => {
    expect(toSatoriImageSrc('ipfs://QmAbc')).toBe(`${FILEBASE_GATEWAY_READ_PATH}QmAbc`);
  });

  it('accepts an absolute http(s) source and an image data URL', () => {
    expect(toSatoriImageSrc('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
    expect(toSatoriImageSrc('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  });

  it('rejects relative paths, which a browser resolves and a server-side card cannot', () => {
    // Copilot caught this on PR #2333. Satori has no page to inherit an origin from, so these are
    // valid in an `<img>` and unfetchable in a card — and accepting one shadows the cover under it.
    expect(toSatoriImageSrc('/static/a.png')).toBeNull();
    expect(toSatoriImageSrc('//cdn.example.com/a.png')).toBeNull();
  });

  it('rejects ipfs forms the resolver does not actually rewrite', () => {
    // Also Copilot's: `getImagePath` only rewrites the exact lowercase `ipfs://` prefix, so these
    // survive resolution unchanged and would be handed to the card as-is.
    expect(toSatoriImageSrc('ipfs:QmAbc')).toBeNull();
    expect(toSatoriImageSrc('IPFS://QmAbc')).toBeNull();
  });

  it('rejects schemes that parse but cannot render, and free text', () => {
    for (const junk of [
      'mailto:user@example.com',
      'javascript:alert(1)',
      'file:///etc/passwd',
      'blob:https://example.com/1234',
      'data:text/html,<script>alert(1)</script>',
      'hello',
      '',
      '   ',
    ]) {
      expect(toSatoriImageSrc(junk), junk).toBeNull();
    }
  });

  it('narrows to an allowlisted host when one is supplied', () => {
    const hosts = new Set([new URL(FILEBASE_GATEWAY_READ_PATH).host]);

    expect(toSatoriImageSrc('ipfs://QmAbc', hosts)).toBe(`${FILEBASE_GATEWAY_READ_PATH}QmAbc`);
    expect(toSatoriImageSrc('https://cdn.example.com/a.png', hosts)).toBeNull();
    // Without the set, an entity card still renders the image its author chose.
    expect(toSatoriImageSrc('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
  });
});

describe('ogShareImageSrc', () => {
  it('prefers OG Image over cover and avatar', () => {
    expect(ogShareImageSrc([COVER, AVATAR, OG('ipfs://QmOg')])).toBe(`${FILEBASE_GATEWAY_READ_PATH}QmOg`);
  });

  it('leaves the existing order untouched below the new first position', () => {
    expect(ogShareImageSrc([COVER, AVATAR])).toBe(`${FILEBASE_GATEWAY_READ_PATH}QmCover`);
    expect(ogShareImageSrc([AVATAR])).toBe(`${FILEBASE_GATEWAY_READ_PATH}QmAvatar`);
  });

  it('falls through an unusable OG Image to the cover rather than to the default card', () => {
    // The whole reason the check lives in the chain: rejecting at the route would lose the cover.
    for (const junk of ['/static/a.png', 'IPFS://QmAbc', 'mailto:a@b.com', 'hello']) {
      expect(ogShareImageSrc([OG(junk), COVER]), junk).toBe(`${FILEBASE_GATEWAY_READ_PATH}QmCover`);
    }
  });

  it('reports nothing when the entity offers no renderable image', () => {
    expect(ogShareImageSrc([])).toBeUndefined();
    expect(ogShareImageSrc(undefined)).toBeUndefined();
    expect(ogShareImageSrc([OG('hello')])).toBeUndefined();
  });
});
