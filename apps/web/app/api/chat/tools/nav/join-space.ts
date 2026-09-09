import { jsonSchema, tool } from 'ai';

import type { JoinSpaceInput } from '~/core/chat/nav-types';

// JSON Schema has no `i` flag — spell the case range out so uppercase hex
// from the model doesn't get pre-runtime rejected.
const SPACE_ID_PATTERN =
  '^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$';

// Schema-only: the request is an on-chain proposal signed by the user's smart
// account, so it runs in the browser (core/chat/join-space-dispatcher.ts).
// Guests excluded at registration — they have no account to propose with.
export function buildJoinSpaceTool() {
  return tool({
    description:
      'Request membership of a public space for the user. Call this ONLY when the user explicitly asks to join, become a member of, or request access to a space ("join the Crypto space", "ask for membership here"). Never call it speculatively — wanting to read, search or navigate a space is not a request to join it, and the proposal is signed immediately without a further confirmation step. Pass a spaceId that came from a tool result this turn; call listSpaces first when the user named the space. This submits a membership request that the space\'s editors vote on — it does not grant access, so never tell the user they have joined.',
    inputSchema: jsonSchema<JoinSpaceInput>({
      type: 'object',
      properties: {
        spaceId: {
          type: 'string',
          pattern: SPACE_ID_PATTERN,
          description: 'The space to join. Dashless 32-hex or dashed UUID, from a tool result this turn.',
        },
      },
      required: ['spaceId'],
      additionalProperties: false,
    }),
  });
}
