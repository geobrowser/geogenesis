import { jsonSchema, tool } from 'ai';
import { Either } from 'effect';
import * as Effect from 'effect/Effect';

import type { NavigateInput, NavigateOutput } from '~/core/chat/nav-types';
import { getSpace } from '~/core/io/queries';

const ENTITY_ID_PATTERN = '^[a-f0-9]{32}$|^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$';
const ENTITY_ID_REGEX = /^[a-f0-9]{32}$|^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export type NavigateToolContext = {
  personalSpaceId: string | null;
};

// Factory rather than a bare tool: the personalSpace target is only valid
// when the signed-in user has a personal space, and that signal lives in the
// client-supplied ChatClientContext the route validates. Closing over it here
// lets the tool return `{ ok: false, error: 'no_personal_space' }` instead of
// silently succeeding and letting the client no-op.
export function buildNavigateTool(context: NavigateToolContext) {
  return tool({
    description:
      'Navigate the user to a page in the Geo app. Call this only when the user explicitly asks to go somewhere (e.g. "take me to my personal space", "open the Root space", "show me this entity"). Only pass space or entity ids that came from a tool result this turn — never invent or recycle an id from an earlier turn. When navigating to a space by name, call listSpaces first and use the spaceId it returns.',
    inputSchema: jsonSchema<NavigateInput>({
      type: 'object',
      properties: {
        target: {
          type: 'string',
          enum: ['root', 'explore', 'personalHome', 'personalSpace', 'space', 'entity'],
          description:
            '"root" = /root. "explore" = /explore (a chronological feed of the newest entities and activity across Geo — use for "what\'s the latest?", "newest stuff", "what\'s new on Geo"). "personalHome" = /home (signed-in dashboard). "personalSpace" = the user\'s own space (requires a Personal space id in Current context). "space" = a specific space (requires spaceId). "entity" = an entity inside a space (requires entityId and spaceId).',
        },
        spaceId: {
          type: 'string',
          pattern: ENTITY_ID_PATTERN,
          description: 'Required when target is "space" or "entity". Dashless 32-hex or dashed UUID.',
        },
        entityId: {
          type: 'string',
          pattern: ENTITY_ID_PATTERN,
          description: 'Required when target is "entity". Dashless 32-hex or dashed UUID.',
        },
      },
      required: ['target'],
      additionalProperties: false,
    }),
    // The client performs the actual router.push only after seeing ok: true in
    // the output, so this validation is the gate that prevents a hallucinated
    // or topic-entity id from being used as a space id.
    execute: async (input: NavigateInput): Promise<NavigateOutput> => {
      if ((input.target === 'space' || input.target === 'entity') && !isValidId(input.spaceId)) {
        return { ok: false, error: 'invalid_input', target: input.target };
      }
      if (input.target === 'entity' && !isValidId(input.entityId)) {
        return { ok: false, error: 'invalid_input', target: input.target };
      }

      if (input.target === 'personalSpace') {
        if (!context.personalSpaceId) {
          return { ok: false, error: 'no_personal_space', target: 'personalSpace' };
        }
        // Echo the resolved id so the client doesn't have to re-read context.
        return { ok: true, target: 'personalSpace', spaceId: context.personalSpaceId };
      }

      if (input.target === 'space' && input.spaceId) {
        const result = await Effect.runPromise(Effect.either(getSpace(input.spaceId)));
        if (Either.isLeft(result) || result.right === null) {
          return { ok: false, error: 'space_not_found', target: 'space', attemptedSpaceId: input.spaceId };
        }
      }

      return { ok: true, target: input.target, spaceId: input.spaceId, entityId: input.entityId };
    },
  });
}

function isValidId(value: string | undefined): value is string {
  return typeof value === 'string' && ENTITY_ID_REGEX.test(value);
}
