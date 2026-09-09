import { jsonSchema, tool } from 'ai';

import type { ApplyImportInput } from '~/core/chat/import/tool-types';

// Schema-only — the client dispatcher runs the import against the local store,
// where the parsed rows live. Writes land as staged edits in the review panel;
// nothing is published.
export const applyImport = tool({
  description:
    'Stage an approved import as local edits. Call this only after showing the user the mapping from proposeImportMapping and getting a clear yes. It creates or updates one entity per row and links relation columns to existing entities. The edits appear in the review panel for the user to publish — this does not publish anything, and it cannot be undone from here, so do not call it speculatively. Returns counts of what was staged, plus per-column conversion tallies you should relay in one short sentence.\n\n' +
    "The import lands in the space the user is currently in, not the one the file was attached from. Moving to another space and importing there is supported and needs no re-attach — but the mapping has to be rebuilt first, because it is computed against one space's ontology.\n\n" +
    'Errors mean different things and need different answers. `not_authorized` means the user is signed in but cannot edit that space — say so and name the space; do NOT tell them to sign in, and do NOT suggest refreshing. `rate_limited` means wait and retry. `not_signed_in` is the only one where signing in helps. `unknown_import` means the attached file is no longer available and they should attach it again. `already_staged` means this same file was imported earlier and those edits are still sitting unpublished in the review panel — tell the user that, with the count it returns, and that importing again would duplicate them; do not retry, and leave publishing or discarding the pending edits to them. `space_changed` means the user moved spaces since the mapping was made, so it was built for the wrong ontology — call `proposeImportMapping` again to rebuild it for where they are now, show them the new mapping, and get a yes before importing. Do NOT report `space_changed` as a permission problem; it is not one.',
  inputSchema: jsonSchema<ApplyImportInput>({
    type: 'object',
    properties: {
      importId: {
        type: 'string',
        minLength: 1,
        description: 'The id of the attached file whose mapping the user just approved.',
      },
    },
    required: ['importId'],
    additionalProperties: false,
  }),
});
