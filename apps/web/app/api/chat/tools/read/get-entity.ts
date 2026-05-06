import { jsonSchema, tool } from 'ai';

import type { GetEntityInput } from '~/core/chat/read-types';

// No-execute: the actual lookup runs client-side in `useReadDispatcher` so the
// agent sees the merged local+remote view (including unpublished edits).
export const getEntityTool = tool({
  description:
    "Fetch a single entity from the Geo knowledge graph by id. Returns its property `values`, outgoing `relations` (up to 10, with BLOCKS and TABS excluded), a `blocks` array of every content block in order, a `tabs` array of every tab on the page, and a `schema` array of the suggested properties from this entity's types — including `{ propertyId, propertyName, dataType, filled }` for each. Use `schema` to discover fillable slots the entity hasn't set yet (Tags, Roles, Date of birth, etc.) before saying \"no such property\" or creating a duplicate. Call this before any `deleteBlock` / `updateBlock` / `setDataBlockView`, to expand a searchGraph result, or to enumerate tabs (tabs have their own blocks — call `getEntity(tabId)`). Long values are truncated. Results reflect the user's current view, including any unpublished local edits — `isDraft: true` indicates a local-only entity.",
  inputSchema: jsonSchema<GetEntityInput>({
    type: 'object',
    properties: {
      entityId: { type: 'string', description: 'The entity id (dashless hex or uuid).' },
      spaceId: { type: 'string', description: 'Optional — space id to scope the lookup.' },
    },
    required: ['entityId'],
    additionalProperties: false,
  }),
});
