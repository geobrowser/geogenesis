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
   * What the far end of this relation should be — the model's reading of the
   * column, used only as a fallback.
   *
   * The whole reason this feature helps: the property API returns
   * `relationValueTypes: []`, which makes the resolver's type filter a no-op
   * and drops it back to ranking candidates by popularity — how a `Founders`
   * column ends up pointing at a Project called "Elon Musk".
   *
   * Apply re-hydrates from the live ontology and prefers whatever that returns;
   * these ids are consulted only when it returns nothing. So an empty array is
   * the normal, healthy case — it means the ontology answered and the model was
   * told to stay out of it.
   */
  relationTypeIds: string[];
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
  'not_signed_in' | 'rate_limited' | 'timed_out' | 'invalid_input' | 'no_types_in_space' | 'mapping_failed';

export type ImportMapOutput = ImportMapping | { error: ImportMapError };

export function isMappingError(output: ImportMapOutput): output is { error: ImportMapError } {
  return 'error' in output;
}
