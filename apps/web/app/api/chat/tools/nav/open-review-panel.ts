import { jsonSchema, tool } from 'ai';

import type { OpenReviewPanelInput, OpenReviewPanelOutput } from '~/core/chat/nav-types';

import type { WriteContext } from '../write/context';

// Lives in nav (not write) — changes UI state without staging a graph edit.
// Guests excluded: no staged edits to review.
export function buildOpenReviewPanelTool(context: WriteContext) {
  return tool({
    description:
      'Open the Review edits panel so the user can review their staged changes and publish. Call this when the user asks to "open review edits", "show my staged changes", "review my edits", or similar. Do NOT call this just because you completed a write — the user may want to keep editing. You still never name the proposal or click Publish; those remain user actions inside the panel.',
    inputSchema: jsonSchema<OpenReviewPanelInput>({
      type: 'object',
      properties: {},
      additionalProperties: false,
    }),
    execute: async (): Promise<OpenReviewPanelOutput> => {
      if (context.kind !== 'member') return { ok: false, error: 'not_signed_in' };
      return { ok: true };
    },
  });
}
