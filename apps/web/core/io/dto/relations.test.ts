import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';
import { describe, expect, it } from 'vitest';

import { RelationDtoLive, type RemoteRelationWithTarget } from './relations';

const SPACE_ID = 'c9f267dcb0d270718c2a3c45a64afd32';
const IPFS_URL_PROPERTY_HEX = SystemIds.IMAGE_URL_PROPERTY.replace(/-/g, '');
const WEB_URL_PROPERTY_HEX = ContentIds.WEB_URL_PROPERTY.replace(/-/g, '');
const IMAGE_TYPE_HEX = SystemIds.IMAGE_TYPE.replace(/-/g, '');
const VIDEO_TYPE_HEX = SystemIds.VIDEO_TYPE.replace(/-/g, '');

const WEB_URL = 'https://chat.example/debates/deb-1/media/artifacts/final_video/content';
const IPFS_URL = 'ipfs://bafymediacid';

function remoteRelation({
  types = [],
  valuesList = [],
}: {
  types?: { id: string }[];
  valuesList?: { spaceId: string; propertyId: string; text: string | null }[];
}): RemoteRelationWithTarget {
  return {
    id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    spaceId: SPACE_ID,
    position: null,
    verified: null,
    fromEntity: { id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', name: 'Debate' },
    toEntity: { id: 'cccccccccccccccccccccccccccccccc', name: 'Debate video', types, valuesList },
    toSpaceId: null,
    type: { id: 'dddddddddddddddddddddddddddddddd', name: 'Debate videos' },
  } as unknown as RemoteRelationWithTarget;
}

function value(propertyId: string, text: string) {
  return { spaceId: SPACE_ID, propertyId, text };
}

describe('RelationDtoLive media URL resolution', () => {
  it('reads the Web URL property for a Video-typed target', () => {
    const relation = RelationDtoLive(
      remoteRelation({ types: [{ id: VIDEO_TYPE_HEX }], valuesList: [value(WEB_URL_PROPERTY_HEX, WEB_URL)] })
    );
    expect(relation.renderableType).toBe('VIDEO');
    expect(relation.toEntity.value).toBe(WEB_URL);
  });

  it('reads the Web URL property for an Image-typed target', () => {
    const relation = RelationDtoLive(
      remoteRelation({ types: [{ id: IMAGE_TYPE_HEX }], valuesList: [value(WEB_URL_PROPERTY_HEX, WEB_URL)] })
    );
    expect(relation.renderableType).toBe('IMAGE');
    expect(relation.toEntity.value).toBe(WEB_URL);
  });

  // Pre-existing IPFS-pinned entities must keep resolving exactly as before the Web URL fallback.
  it('prefers the IPFS URL when both properties are present', () => {
    const relation = RelationDtoLive(
      remoteRelation({
        types: [{ id: VIDEO_TYPE_HEX }],
        valuesList: [value(WEB_URL_PROPERTY_HEX, WEB_URL), value(IPFS_URL_PROPERTY_HEX, IPFS_URL)],
      })
    );
    expect(relation.toEntity.value).toBe(IPFS_URL);
  });

  // `Web URL` is the generic canonical-link property (sources, articles, …): its presence on an
  // untyped target must not turn an ordinary relation into a broken image render.
  it('does not promote an untyped target to IMAGE on a Web URL value', () => {
    const relation = RelationDtoLive(remoteRelation({ valuesList: [value(WEB_URL_PROPERTY_HEX, WEB_URL)] }));
    expect(relation.renderableType).toBe('RELATION');
    expect(relation.toEntity.value).toBe('cccccccccccccccccccccccccccccccc');
  });

  // The legacy behavior: an IPFS URL alone promotes an untyped target to IMAGE.
  it('still promotes an untyped target to IMAGE on an IPFS URL value', () => {
    const relation = RelationDtoLive(remoteRelation({ valuesList: [value(IPFS_URL_PROPERTY_HEX, IPFS_URL)] }));
    expect(relation.renderableType).toBe('IMAGE');
    expect(relation.toEntity.value).toBe(IPFS_URL);
  });
});
