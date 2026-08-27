import { jsonSchema, tool } from 'ai';

type ToggleEditModeInput = { mode: 'browse' | 'edit' };

export const toggleEditMode = tool({
  description:
    'Switch the app between browse and edit mode. Edit mode is required before any write — call this before the first setEntityValue / createBlock / etc. in a turn if Current context shows `Edit mode: off`. Do not ask for permission; mode is cheap and reversible.',
  inputSchema: jsonSchema<ToggleEditModeInput>({
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['browse', 'edit'] },
    },
    required: ['mode'],
    additionalProperties: false,
  }),
});
