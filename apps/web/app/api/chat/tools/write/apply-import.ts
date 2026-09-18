import { jsonSchema, tool } from 'ai';

import type { ApplyImportInput } from '~/core/chat/import/tool-types';

const SPACE_ID = '^[a-f0-9]{32}$|^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$';

// Schema-only — the client dispatcher runs the import against the local store,
// where the parsed rows live. Writes land as staged edits in the review panel;
// nothing is published.
export const applyImport = tool({
  description:
    'Stage an approved import as local edits — every tab of the file that was not excluded, in one call. Call this only after showing the user the mapping from proposeImportMapping and getting a clear yes. It creates or updates one entity per row, links relation columns to existing entities, and links a cell that names a row of another tab in the same file to that row. The edits appear in the review panel for the user to publish — this does not publish anything, and it cannot be undone from here, so do not call it speculatively. Returns counts per tab plus conversion tallies you should relay in a sentence or two.\n\n' +
    "The import lands in the space the user is in, or the `spaceId` they named — pass the same `spaceId` you passed to proposeImportMapping. Moving to another space and importing there is supported and needs no re-attach, but the mapping has to be rebuilt first, because it is computed against one space's ontology.\n\n" +
    'Errors mean different things and need different answers. `not_authorized` means the user is signed in but cannot edit that space — say so and name the space; do NOT tell them to sign in, and do NOT suggest refreshing. `rate_limited` means wait and retry. `not_signed_in` is the only one where signing in helps. `unknown_import` means the attached file is no longer available and they should attach it again — never say this for any other error. `no_mapping_yet` means proposeImportMapping has not run for that tab yet — run it, show the result, get a yes. `no_name_column` names a tab whose header row could not be used; ask the user which column holds the names. `already_staged` means this same file was imported earlier and those edits are still sitting unpublished in the review panel — tell the user that, with the count it returns, and that importing again would duplicate them; do not retry, and leave publishing or discarding the pending edits to them. `space_changed` means the mapping was built for a different space than the one being imported into — call `proposeImportMapping` again for the right space, show them the new mapping, and get a yes before importing. Do NOT report `space_changed` as a permission problem; it is not one. `apply_failed` names the tab that failed; say that plainly and do not invent a cause.',
  inputSchema: jsonSchema<ApplyImportInput>({
    type: 'object',
    properties: {
      importId: {
        type: 'string',
        minLength: 1,
        description: 'The id of the attached file whose mapping the user just approved.',
      },
      spaceId: {
        type: 'string',
        pattern: SPACE_ID,
        description:
          'Only when the user named a space other than the one they are in. Must match the space the mapping was proposed for.',
      },
    },
    required: ['importId'],
    additionalProperties: false,
  }),
});
