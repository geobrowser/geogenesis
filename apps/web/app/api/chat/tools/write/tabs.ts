import { jsonSchema, tool } from 'ai';

import { ENTITY_ID_PATTERN } from './shared';

type CreateTabInput = {
  parentEntityId: string;
  spaceId: string;
  name: string;
};

export const createTab = tool({
  description: `Add a tab to a page. Tabs are extra Page entities hanging off a parent via the Tabs property — each tab can have its own blocks. Mints a new entity, types it as Page, and links it to the parent at the end of the existing tab list. Pass \`parentEntityId\` (the page that gets the new tab — usually \`currentEntityId\`), \`spaceId\`, and \`name\` (the visible label). Returns the new \`tabId\` in the intent so you can immediately add blocks to it via \`createBlock({ parentEntityId: tabId })\`. Use \`renameTab\` to rename, \`deleteEntity\` to remove (which also tombstones the parent's Tabs edge), and \`moveRelation\` with \`typeId\` set to the Tabs property to reorder.`,
  inputSchema: jsonSchema<CreateTabInput>({
    type: 'object',
    properties: {
      parentEntityId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      spaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      name: { type: 'string' },
    },
    required: ['parentEntityId', 'spaceId', 'name'],
    additionalProperties: false,
  }),
});

type RenameTabInput = {
  tabId: string;
  spaceId: string;
  name: string;
};

export const renameTab = tool({
  description:
    'Rename a tab on a page. Pass `tabId` (the tab entity, from the parent\'s Tabs relations) and the new `name`. This is a thin wrapper over `setEntityValue` on the Name property — call it when the user explicitly says "rename the X tab" so the diff renders cleanly. No effect on the tab\'s blocks.',
  inputSchema: jsonSchema<RenameTabInput>({
    type: 'object',
    properties: {
      tabId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      spaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      name: { type: 'string' },
    },
    required: ['tabId', 'spaceId', 'name'],
    additionalProperties: false,
  }),
});
