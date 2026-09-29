/**
 * What the two import tools take and return.
 *
 * The model never handles the mapping structure itself. `proposeImportMapping`
 * stores the full mappings — ids and all — on the client session and returns a
 * readable digest; `applyImport` names the same session and the dispatcher
 * reads the stored mappings back. Corrections go through `hint` and a
 * re-propose rather than an edit protocol, so there is no path by which a
 * mangled id makes a round trip through prose.
 *
 * A file is a set of tabs. A CSV is one tab; a workbook is one per data tab,
 * and the mapping, the confirmation and the apply all cover every tab at once.
 */

/**
 * Client-dispatched write tools that are not edit intents.
 *
 * `applyImport` writes to a space and so must pass the same member and
 * rate-limit gate as any edit, but it is not planned by `edit-dispatcher` —
 * it runs the import engine instead. Keeping it out of `EDIT_TOOL_NAMES` is
 * what stops two dispatchers racing to answer the same tool call; naming it
 * here is what still lets `/api/chat/authorize-write` accept it.
 */
export const IMPORT_WRITE_TOOL_NAMES = ['applyImport'] as const;

export type ProposeImportMappingInput = {
  importId: string;
  /** The user's correction, in their words, when re-proposing. */
  hint?: string;
  /** Only these column headers may change; preserves the row type and all other mappings. */
  columns?: string[];
  /** Re-map only this tab. Omitted: every tab that is not excluded. */
  sheet?: string;
  /** Tabs the user asked to leave out. Replaces the stored list when present. */
  excludeSheets?: string[];
  /** The space to map against when the user named one. Omitted: the space they are in. */
  spaceId?: string;
};

export type ApplyImportInput = {
  importId: string;
  /** The space to import into when the user named one. Omitted: the space they are in. */
  spaceId?: string;
};

/** One column, with ontology ids to keep later corrections unambiguous. */
export type MappingDigestColumn = {
  column: string;
  mappedTo: string;
  propertyId?: string;
  targetTypes?: string[];
  /** 'value' | 'relation' | 'skipped' */
  as: string;
  /** Present for skipped columns. */
  reason?: string;
  /** Present for value columns whose conversion is worth naming. */
  converts?: string;
  /**
   * Set on a skipped column that had matching properties anyway. The curator
   * can overrule it; nobody else can, so it has to reach them.
   */
  candidatesFound?: boolean;
  suggestedProperty?: { name: string; dataType: string; relationTypeName?: string };
};

/** One tab's mapping, as described back to the model. */
export type SheetMappingDigest = {
  sheet: string;
  rowCount: number;
  type: string;
  typeId: string;
  nameColumn: string;
  columns: MappingDigestColumn[];
  skippedCount: number;
  /** Of the skipped columns, how many had candidates and were turned down. */
  reviewableCount: number;
  summary: string;
  /** Rows reshaped at parse time because their cell count didn't match the header. */
  raggedRows: number;
  /** Title or note lines above the header that were left out. */
  skippedLeadingRows: number;
};

export type ProposeImportMappingOutput =
  | {
      importId: string;
      status: 'preview';
      /** False means confirmation cannot bypass the mapping problem. */
      canApply: boolean;
      requiresConfirmation: true;
      linkWarnings: string[];
      fileName: string;
      /** The space the mappings were built for and will import into. */
      spaceId: string;
      sheets: SheetMappingDigest[];
      excludedSheets: string[];
      /** Tabs that held no table and were left out at parse time. */
      skippedSheets: { sheet: string; reason: string }[];
    }
  | { error: 'unknown_sheet'; sheet: string; availableSheets: string[] }
  | { error: ImportToolError; sheet?: string; message?: string };

/** One tab's outcome. */
export type SheetApplyDigest = {
  sheet: string;
  typeName: string;
  entityCount: number;
  linkedEntityCount: number;
  editCount: number;
  ambiguousRows: number;
  unresolvedRelations: number;
  /** Relation cells that were linked to a row of another tab in this file. */
  /** Newly staged relation edges, not the number of distinct shared targets. */
  crossSheetLinks: number;
  /** Columns where some values could not be converted, for a one-line mention. */
  conversionNotes: string[];
};

export type ApplyImportOutput =
  | {
      staged: true;
      spaceId: string;
      entityCount: number;
      linkedEntityCount: number;
      countScope: string;
      editCount: number;
      sheets: SheetApplyDigest[];
    }
  // Denials carry their detail so the assistant can say something true. These
  // are three different problems with three different fixes — signing in again
  // does nothing for a space you simply cannot edit.
  | { error: 'not_authorized'; spaceId: string }
  | { error: 'rate_limited'; retryAfter?: number }
  // This file is already staged and waiting in the review panel. Staging it
  // again would write every value and relation a second time.
  | { error: 'already_staged'; fileName: string; stagedAt: number; entityCount: number }
  // The user moved to a different space after the mapping was made. Not a
  // refusal — a redirect: the mapping is stale for where they now are, and
  // re-proposing produces the right one for this space.
  | { error: 'space_changed'; mappedForSpaceId: string; currentSpaceId: string }
  | { error: 'no_mapping_yet'; sheet?: string }
  | { error: ImportToolError; sheet?: string; message?: string };

export type ImportToolError =
  | 'unknown_import'
  | 'nothing_to_import'
  | 'no_mapping_yet'
  | 'no_name_column'
  | 'wrong_space'
  | 'not_signed_in'
  | 'not_authorized'
  | 'rate_limited'
  | 'timed_out'
  | 'no_types_in_space'
  | 'ontology_change_required'
  | 'unknown_column'
  | 'mapping_failed'
  | 'invalid_mapping'
  | 'invalid_values'
  | 'apply_failed'
  | 'aborted';
