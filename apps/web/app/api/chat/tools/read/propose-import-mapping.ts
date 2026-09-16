import { jsonSchema, tool } from 'ai';

import type { ProposeImportMappingInput } from '~/core/chat/import/tool-types';

const SPACE_ID = '^[a-f0-9]{32}$|^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$';

// Schema-only — the client dispatcher runs the mapping sub-agent, once per tab
// in parallel, and returns a per-tab digest. The rows never leave the browser.
export const proposeImportMapping = tool({
  description:
    "Work out how an attached CSV or Excel file maps onto a space's ontology — every tab of it at once. Call this straight away when the user attaches a file and asks to import it; you do not need to ask anything first. For each tab it returns the type the rows become, which existing property each column maps to, how each column's values convert, and which columns have no matching property. Nothing is written.\n\n" +
    '**Show the user what came back, tab by tab, and ask them to confirm once for the whole file before calling applyImport.** Corrections come back through this tool, never by editing the mapping yourself: to leave tabs out pass `excludeSheets`; to change what one tab becomes ("the Topics tab should be Categories", "in Publishers, Owner should be a relation") pass `hint` with their words and `sheet` naming that tab, so the other tabs keep their mapping. A `hint` without `sheet` or `excludeSheets` re-maps every tab. When changing only tab inclusion, send `excludeSheets` alone: existing mappings stay fixed even if a hint is also sent. For a global remap plus exclusions, make separate requests. For a column-specific correction always also pass `columns` to preserve the untouched mappings. Newly staged local types and properties are available immediately. If a skipped column includes suggestedProperty, present that proposal for approval; after creating the approved property, preview again. `unknown_sheet` means the tab name did not match; the reply lists the real names.\n\n' +
    'The mapping is built against the space the user is in unless they named another one — then pass `spaceId`, and pass the same `spaceId` to applyImport. It is specific to that space: if they later want a different space, call this again for it.',
  inputSchema: jsonSchema<ProposeImportMappingInput>({
    type: 'object',
    properties: {
      importId: {
        type: 'string',
        minLength: 1,
        description: 'The id of the attached file, given to you in the [Attached file] note.',
      },
      hint: {
        type: 'string',
        minLength: 1,
        maxLength: 400,
        description:
          'Only when re-proposing after the user asked for a change. Their correction in plain language — "Sector should be Topics", "these are People not Projects". Leave empty on the first call.',
      },
      columns: {
        type: 'array',
        minItems: 1,
        maxItems: 60,
        items: { type: 'string', minLength: 1, maxLength: 200 },
        description:
          'For a correction to specific columns, pass their exact headers and hint. Only these columns change; all others and the row type stay as previewed. Omit when changing the row type or name column.',
      },
      sheet: {
        type: 'string',
        minLength: 1,
        maxLength: 200,
        description:
          'Re-map only this tab, by the name shown in the [Attached file] note. Use it with `hint` for a correction to one tab. Leave empty to map every tab.',
      },
      excludeSheets: {
        type: 'array',
        maxItems: 50,
        items: { type: 'string', minLength: 1, maxLength: 200 },
        description:
          'Tabs to leave out of the import, by name, when the user asked to skip them. Replaces any earlier exclusions; pass an empty array to include every tab again.',
      },
      spaceId: {
        type: 'string',
        pattern: SPACE_ID,
        description:
          'Only when the user named a space other than the one they are in. The id of the space to import into.',
      },
    },
    required: ['importId'],
    additionalProperties: false,
  }),
});
