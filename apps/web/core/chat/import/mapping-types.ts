/**
 * The contract between the mapping sub-agent and its caller.
 *
 * Mirrors `core/chat/geo-query-types.ts`: shared so the route and the client
 * dispatcher can never drift on the shape they exchange.
 */
import type { RelationSplitRule } from '~/partials/import/relation-cell';

import type { CoercionRule } from './coerce';

export { RELATION_SPLIT_RULES, isRelationSplitRule, type RelationSplitRule } from '~/partials/import/relation-cell';

export type MappingColumnInput = {
  index: number;
  header: string;
  /** Up to five distinct non-empty values. The only file content that leaves the browser. */
  samples: string[];
  /** How many rows have a value in this column. */
  filled: number;
};

export type LocalImportOntology = {
  types: { id: string; name: string | null }[];
  properties: {
    id: string;
    name: string | null;
    dataType: string;
    renderableTypeStrict?: string | null;
    relationValueTypes: { id: string; name: string | null }[];
  }[];
};

export type ImportMapInput = {
  spaceId: string;
  fileName: string;
  rowCount: number;
  columns: MappingColumnInput[];
  /**
   * The user's correction, in their own words — "these are People, not
   * Projects", "Sector should be Topics". Present only on a re-propose.
   *
   * The whole correction loop runs through this: there is no patch path, so a
   * hint that fails to reach the sub-agent produces a byte-identical mapping
   * and the assistant looks like it ignored the user.
   */
  hint?: string;
  /**
   * Spaces to look for types and properties in, beyond the target space and
   * root — the user's personal space and everything they can edit.
   *
   * Sent by the client because only the client knows the membership list. A
   * non-canonical property is invisible unless its space is named, so omitting
   * these makes a property the user can plainly see elsewhere come back as
   * "does not exist".
   */
  searchSpaceIds?: string[];
  localOntology?: LocalImportOntology;
  previousMapping?: ImportMapping;
  workbookSheets?: { name: string; nameSamples: string[] }[];
};

/** A column that becomes a plain value on the entity. */
export type MappedValueColumn = {
  index: number;
  kind: 'value';
  propertyId: string;
  propertyName: string;
  coercion: CoercionRule;
};

/** A column that becomes a link to another entity. */
export type MappedRelationColumn = {
  index: number;
  kind: 'relation';
  propertyId: string;
  propertyName: string;
  /**
   * Target types from the property's ontology, or validated model choices when
   * the property has none. Apply re-hydrates the live ontology and prefers it
   * if its declared types have changed since preview.
   */
  relationTypeIds: string[];
  relationTypeNames?: string[];
  /**
   * How many names a cell in this column holds.
   *
   * Optional because mappings persisted before the rule existed do not carry
   * one, and because `list` — the old fixed behaviour — is the right default
   * for most columns. Set it when the samples say otherwise: `none` for values
   * that contain commas of their own ("Chicago, Illinois, United States"),
   * `slash` for values written "ceo/founder".
   */
  split?: RelationSplitRule;
};

/** A column with no matching property. Never invented — reported and dropped. */
export type SkippedColumn = {
  index: number;
  kind: 'skip';
  reason: string;
  /**
   * True when properties *were* found for this column and it was skipped
   * anyway.
   *
   * The two kinds of skip are not the same news. "Nothing in this space fits"
   * is finished business; "I found three candidates and judged none of them
   * right" is a call the curator may well disagree with, and they can only
   * disagree with it if they are told it happened. The earlier CSV pipeline
   * reached the same conclusion the hard way and made an unmapped column a
   * blocking error rather than a silent drop.
   */
  hadCandidates?: boolean;
  suggestedProperty?: { name: string; dataType: string; relationTypeName?: string };
};

export type MappedColumn = MappedValueColumn | MappedRelationColumn | SkippedColumn;

export type ImportMapping = {
  typeId: string;
  typeName: string;
  /** Index of the column holding the entity name. */
  nameColumn: number;
  columns: MappedColumn[];
  /** One or two sentences the assistant can relay. */
  summary: string;
};

export type ImportMapError =
  | 'not_signed_in'
  | 'rate_limited'
  | 'timed_out'
  | 'invalid_input'
  | 'no_types_in_space'
  | 'mapping_failed'
  | 'ontology_change_required';

export type ImportMapOutput = ImportMapping | { error: ImportMapError; message?: string };

export function isMappingError(output: ImportMapOutput): output is { error: ImportMapError } {
  return 'error' in output;
}
