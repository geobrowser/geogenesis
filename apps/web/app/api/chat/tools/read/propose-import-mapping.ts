import { jsonSchema, tool } from 'ai';

import type { ProposeImportMappingInput } from '~/core/chat/import/tool-types';

// Schema-only — the client dispatcher reads the parsed file out of the local
// import session, sends only headers and a few sample values to
// /api/chat/import-map, and hands the finished mapping back. The rows never
// leave the browser and never enter this turn's context.
export const proposeImportMapping = tool({
  description:
    "Work out how an uploaded CSV or Excel file maps onto this space's ontology. Call this once as soon as the user attaches a file and asks to import it — you do not need to ask anything first. Returns the type the rows will become, which existing property each column maps to, how each column's values will be converted, and which columns have no matching property. **Show the user the mapping and ask them to confirm before calling applyImport.** If they want something changed — a different type, a different property for a column — call this again with `hint` describing the change in their words; do not try to patch the mapping yourself. Nothing is written until applyImport runs.\n\nThe mapping is built against whichever space the user is in right now, so it is specific to that space. If they move to a different one, call this again — the previous mapping does not carry over, and applyImport will refuse it with `space_changed`.",
  inputSchema: jsonSchema<ProposeImportMappingInput>({
    type: 'object',
    properties: {
      importId: {
        type: 'string',
        minLength: 1,
        description: 'The id of the attached file, given to you when the user uploaded it.',
      },
      hint: {
        type: 'string',
        minLength: 1,
        maxLength: 400,
        description:
          'Only when re-proposing after the user asked for a change. Their correction in plain language — "Sector should be Topics", "these are People not Projects". Leave empty on the first call.',
      },
    },
    required: ['importId'],
    additionalProperties: false,
  }),
});
