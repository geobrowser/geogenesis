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
      'Request membership of a public space for the user. Call this ONLY when the latest user message explicitly asks to join, become a member of, request access to, or retry joining a space ("join the Crypto space", "ask for membership here"). A previous request that was stopped or failed is not fresh authorization. Asking whether a request was submitted or what happened is a read-only status question: NEVER call joinSpace to answer it. Use recorded results, or say the status is unconfirmed. Never call it speculatively — wanting to read, search or navigate a space is not a request to join it. Before the proposal is signed, the panel shows the user the space as resolved by id and they confirm or decline; `declined` means they chose not to send it, so say so and do not call again unless they ask. Pass a spaceId that came from a tool result this turn; call listSpaces first when the user named the space. This submits a membership request that the space\'s editors vote on — it does not grant access, so never tell the user they have joined.',
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
