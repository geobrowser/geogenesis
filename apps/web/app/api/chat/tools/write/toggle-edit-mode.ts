import { jsonSchema, tool } from 'ai';

import type { EditToolOutput } from '~/core/chat/edit-types';

import type { WriteContext } from './context';
import { requireMember } from './shared';

type ToggleEditModeInput = { mode: 'browse' | 'edit' };

export function buildToggleEditModeTool(context: WriteContext) {
  return tool({
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
    // Toggle is a UI-only state change; skip the edit rate limiter so a chatty
    // turn that flips into edit mode early doesn't eat a quota slot.
    execute: async ({ mode }: ToggleEditModeInput): Promise<EditToolOutput> => {
      const gate = requireMember(context);
      if (gate) return gate;
      return { ok: true, intent: { kind: 'toggleEditMode', mode } };
    },
  });
}
