import { jsonSchema, tool } from 'ai';

import type { OpenReviewPanelInput, OpenReviewPanelOutput } from '~/core/chat/nav-types';

import type { WriteContext } from '../write/context';

// Opens the Review edits / Review changes panel — the overlay that lists
// staged edits and lets the user name + publish a proposal. This tool only
// *opens* the panel; the assistant never names a proposal or clicks Publish.
//
// Lives in nav (not write) because it changes what the user sees without
// staging a graph edit. Registered with a member-aware context only so guests
// don't see it in their tool list — a guest can't have staged edits anyway
// (they have no write tools), but hiding it keeps the capability set honest.
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
