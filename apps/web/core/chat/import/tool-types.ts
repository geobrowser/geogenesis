/**
 * What the two import tools take and return.
 *
 * The model never handles the mapping structure itself. `proposeImportMapping`
 * stores the full mapping — ids and all — on the client session and returns a
 * readable digest; `applyImport` names the same session and the dispatcher
 * reads the stored mapping back. Corrections go through `hint` and a re-propose
 * rather than an edit protocol, so there is no path by which a mangled id makes
 * a round trip through prose.
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
};

export type ApplyImportInput = {
  importId: string;
};

/** One column, as described back to the model. No ids. */
export type MappingDigestColumn = {
  column: string;
  mappedTo: string;
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
};

export type ProposeImportMappingOutput =
  | {
      importId: string;
      fileName: string;
      rowCount: number;
      type: string;
      nameColumn: string;
      columns: MappingDigestColumn[];
      skippedCount: number;
      /** Of the skipped columns, how many had candidates and were turned down. */
      reviewableCount: number;
      summary: string;
      /** Rows reshaped at parse time because their cell count didn't match the header. */
      raggedRows: number;
    }
  | { error: ImportToolError };

export type ApplyImportOutput =
  | {
      staged: true;
      entityCount: number;
      editCount: number;
      typeName: string;
      ambiguousRows: number;
      unresolvedRelations: number;
      /** Columns where some values could not be converted, for a one-line mention. */
      conversionNotes: string[];
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
  | { error: ImportToolError };

export type ImportToolError =
  | 'unknown_import'
  | 'no_mapping_yet'
  | 'wrong_space'
  | 'not_signed_in'
  | 'not_authorized'
  | 'rate_limited'
  | 'timed_out'
  | 'no_types_in_space'
  | 'mapping_failed'
  | 'apply_failed'
  | 'aborted';
