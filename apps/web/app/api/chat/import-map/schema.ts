/**
 * Schemas for the mapping sub-agent's tools.
 *
 * `submitMapping` is where the model's answer is enforced rather than trusted.
 * Two things matter:
 *
 * - `coercion` is an enum of the rules `coerce.ts` actually implements. A
 *   hallucinated `integer:quarter` fails validation instead of falling through
 *   to a default and silently mangling a column.
 * - `kind: 'skip'` is the only way to leave a column unmapped. There is no
 *   "create a property" branch, because inventing schema is out of scope by
 *   decision — the model's options are map it to something real or say why not.
 */
import type { JSONSchema7 } from 'ai';

import { COERCION_RULES } from '~/core/chat/import/coerce';

import { RELATION_SPLIT_RULES } from '~/partials/import/relation-cell';

const ENTITY_ID = '^[a-f0-9]{32}$';

const SPLIT_DESCRIPTION =
  "Optional, for kind 'relation'. How many entities one cell names. 'list' (the default) splits on commas, semicolons and pipes. 'none' treats the whole cell as one name — use it when the names themselves contain commas, like 'Chicago, Illinois, United States'. 'slash' also splits on '/', for cells written 'ceo/founder'.";

export const SEARCH_PROPERTIES_SCHEMA: JSONSchema7 = {
  type: 'object',
  properties: {
    queries: {
      type: 'array',
      minItems: 1,
      maxItems: 12,
      items: { type: 'string', minLength: 1 },
      description:
        'Property names to look for. Send every column you still need in one call — searching them together costs one round trip instead of twelve. Search the meaning, not just the header: a column called "URL" is looked up as "website", "url", "link".',
    },
  },
  required: ['queries'],
  additionalProperties: false,
};

export const LIST_TYPES_SCHEMA: JSONSchema7 = {
  type: 'object',
  properties: {
    nameContains: {
      type: 'string',
      minLength: 1,
      description:
        'Optional name to search for. Searches every type in the space, including ones the unfiltered list did not show.',
    },
  },
  required: [],
  additionalProperties: false,
};

export const SUBMIT_MAPPING_SCHEMA: JSONSchema7 = {
  type: 'object',
  properties: {
    typeId: {
      type: 'string',
      pattern: ENTITY_ID,
      description: 'Id of the type every row becomes. Must be a type returned by listTypes.',
    },
    typeName: { type: 'string', minLength: 1 },
    nameColumn: {
      type: 'integer',
      minimum: 0,
      description: 'Index of the column holding the entity name. Every import needs exactly one.',
    },
    summary: {
      type: 'string',
      minLength: 1,
      maxLength: 600,
      description:
        'One or two sentences for the user: what you mapped, what you skipped and why. Plain language, no ids.',
    },
    columns: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer', minimum: 0, description: 'The column index you were given.' },
          kind: {
            type: 'string',
            enum: ['value', 'relation', 'skip'],
            description:
              "'value' stores the cell as data. 'relation' links it to another entity. 'skip' leaves it out — the only correct choice when no existing property fits.",
          },
          propertyId: {
            type: 'string',
            pattern: ENTITY_ID,
            description: 'Required for value and relation. Must be a property id returned by searchProperties.',
          },
          propertyName: { type: 'string', minLength: 1 },
          coercion: {
            type: 'string',
            enum: [...COERCION_RULES],
            description:
              "Required for kind 'value'. Pick from the column's sample values and the property's data type — 'integer:year' for a year written as prose or a range, 'date:dmy' vs 'date:mdy' when slashed dates could be read either way.",
          },
          relationTypeIds: {
            type: 'array',
            items: { type: 'string', pattern: ENTITY_ID },
            description:
              "Required for kind 'relation' only when the search result showed no relationValueTypes. What kind of entity the cell values name — a Founders column holding people's names points at the Person type. Getting this wrong links the row to the wrong entity.",
          },
          split: {
            type: 'string',
            enum: [...RELATION_SPLIT_RULES],
            description: SPLIT_DESCRIPTION,
          },
          reason: {
            type: 'string',
            minLength: 1,
            maxLength: 200,
            description: "Required for kind 'skip'. Why no existing property fits, in plain language.",
          },
        },
        required: ['index', 'kind'],
        additionalProperties: false,
      },
    },
  },
  required: ['typeId', 'typeName', 'nameColumn', 'columns', 'summary'],
  additionalProperties: false,
};

/**
 * The second look at columns that were skipped despite having candidates.
 *
 * Deliberately narrow. Re-submitting the whole mapping would cost another
 * full pass — measured at ~28s for a 22-column file, since the model emits one
 * row per column — and, worse, it lets untouched columns drift: two runs over
 * the same file have disagreed on columns nobody asked about. This tool can
 * only change the columns that were contested.
 */
export const RECONSIDER_COLUMNS_SCHEMA: JSONSchema7 = {
  type: 'object',
  properties: {
    columns: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          index: {
            type: 'integer',
            minimum: 0,
            description: 'One of the column indexes you were asked to reconsider.',
          },
          kind: {
            type: 'string',
            enum: ['value', 'relation', 'skip'],
            description:
              "Your decision on a second look. 'skip' is still allowed — but give a reason that engages with the candidates you were shown.",
          },
          propertyId: { type: 'string', pattern: ENTITY_ID },
          propertyName: { type: 'string', minLength: 1 },
          coercion: { type: 'string', enum: [...COERCION_RULES] },
          relationTypeIds: { type: 'array', items: { type: 'string', pattern: ENTITY_ID } },
          split: { type: 'string', enum: [...RELATION_SPLIT_RULES], description: SPLIT_DESCRIPTION },
          reason: { type: 'string', minLength: 1, maxLength: 200 },
        },
        required: ['index', 'kind'],
        additionalProperties: false,
      },
    },
    summary: {
      type: 'string',
      maxLength: 600,
      description: 'Optional replacement summary, if your decisions changed what the user should be told.',
    },
  },
  required: ['columns'],
  additionalProperties: false,
};

export type SearchPropertiesInput = { queries: string[] };
export type ListTypesInput = { nameContains?: string };

export type SubmittedColumn = {
  index: number;
  kind: 'value' | 'relation' | 'skip';
  propertyId?: string;
  propertyName?: string;
  coercion?: string;
  relationTypeIds?: string[];
  split?: string;
  reason?: string;
};

export type SubmitMappingInput = {
  typeId: string;
  typeName: string;
  nameColumn: number;
  summary: string;
  columns: SubmittedColumn[];
};

export type ReconsiderColumnsInput = {
  columns: SubmittedColumn[];
  summary?: string;
};
