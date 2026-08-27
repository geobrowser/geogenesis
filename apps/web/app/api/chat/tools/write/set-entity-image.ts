import { jsonSchema, tool } from 'ai';

import { ENTITY_ID_PATTERN } from './shared';

type SetEntityImageInput = {
  entityId: string;
  spaceId: string;
  // Cover image / Avatar / Poster / etc. Must be a RELATION-typed property
  // with renderable type IMAGE.
  propertyId: string;
  // Direct image URL (http / https) or an existing ipfs:// URL. The dispatcher
  // uploads http URLs to IPFS via Graph.createImage and mints an Image entity
  // client-side, then writes the relation.
  sourceUrl: string;
};

export const setEntityImage = tool({
  description:
    "Attach an image to an entity via a RELATION-typed image property — cover image, avatar, poster, logo, etc. ALWAYS use this for image properties; never `setEntityValue` (image properties are RELATION-typed) and never `setEntityRelation` (those don't upload to IPFS or mint the Image entity). The dispatcher uploads `sourceUrl` to IPFS, mints an Image entity, and links it to `entityId` via `propertyId` in one shot. Pass an http(s) URL — call `searchImages` first if you don't already have one. ipfs:// URLs are accepted as-is. Members only.",
  inputSchema: jsonSchema<SetEntityImageInput>({
    type: 'object',
    properties: {
      entityId: { type: 'string', pattern: ENTITY_ID_PATTERN, description: 'The entity getting the image.' },
      spaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      propertyId: {
        type: 'string',
        pattern: ENTITY_ID_PATTERN,
        description: 'A RELATION-typed property with IMAGE renderable type (e.g. Cover image, Avatar, Poster).',
      },
      sourceUrl: {
        type: 'string',
        description: 'http/https URL or ipfs:// URL of the image to attach.',
      },
    },
    required: ['entityId', 'spaceId', 'propertyId', 'sourceUrl'],
    additionalProperties: false,
  }),
});
