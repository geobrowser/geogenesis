'use client';

/**
 * Dispatches the two import tools.
 *
 * Client-side for a reason the other read tools share but this one depends on
 * absolutely: the parsed file lives in a module-scoped Map in this tab. The
 * server has never seen it and never will. `proposeImportMapping` sends the
 * sub-agent headers and a handful of sample values; `applyImport` runs entirely
 * here, against the local store.
 *
 * Mirrors `geo-query-dispatcher.ts` — every dispatched call is answered exactly
 * once, because an unanswered tool call leaves the panel spinning with nothing
 * to resolve it.
 */
import * as React from 'react';

import { type UIMessage, isToolUIPart } from 'ai';

import { normalizeSpaceId } from '~/core/access/space-access';
import { useGlobalSearchSpaceIds } from '~/core/hooks/use-global-search-space-ids';
import { useSyncEngine } from '~/core/sync/use-sync-engine';

import { enqueue } from './apply-queue';
import { type EditToolFailure, notSignedIn } from './edit-types';
import { type ApplyResult, applyImportToStore } from './import/apply';
import type { ImportMapOutput, ImportMapping, MappedColumn } from './import/mapping-types';
import { type ImportSession, ImportSessions, type StoredImportSession, sampleColumns } from './import/session';
import type {
  ApplyImportInput,
  ApplyImportOutput,
  ImportToolError,
  MappingDigestColumn,
  ProposeImportMappingInput,
  ProposeImportMappingOutput,
} from './import/tool-types';

const PROPOSE_TOOL_PART = 'tool-proposeImportMapping';
const APPLY_TOOL_PART = 'tool-applyImport';

export type AddImportResultFn = (args: { tool: string; toolCallId: string; output: unknown }) => void;

/**
 * Mappings live with their session (see `ImportSessions.setMapping`) rather
 * than in a Map here. Both halves are needed to apply, so both have to survive
 * a reload — keeping the mapping in module scope would mean a restored session
 * still dead-ended on `no_mapping_yet`.
 */
export function rememberMapping(importId: string, mapping: ImportMapping, mappedForSpaceId?: string): Promise<void> {
  return ImportSessions.setMapping(importId, mapping, mappedForSpaceId);
}

export function forgetMapping(importId: string): Promise<void> {
  return ImportSessions.setMapping(importId, undefined as unknown as ImportMapping);
}

/** How a coercion rule reads to someone who has never heard of one. */
const RULE_DESCRIPTIONS: Record<string, string> = {
  'integer:year': 'reads the year out of each value',
  integer: 'reads each value as a whole number',
  float: 'reads each value as a number',
  decimal: 'reads each value as a number',
  boolean: 'reads each value as yes/no',
  date: 'reads each value as a date',
  'date:dmy': 'reads each value as a day-first date',
  'date:mdy': 'reads each value as a month-first date',
  datetime: 'reads each value as a date and time',
  time: 'reads each value as a time',
};

function describeColumn(column: MappedColumn, header: string): MappingDigestColumn {
  if (column.kind === 'skip') {
    return {
      column: header,
      mappedTo: '—',
      as: 'skipped',
      reason: column.reason,
      // Surfaced so the assistant can separate "nothing here fits" from "I
      // found candidates and turned them down" — only the second is worth the
      // curator's attention, and only they can overrule it.
      ...(column.hadCandidates ? { candidatesFound: true } : {}),
    };
  }
  if (column.kind === 'relation') {
    return { column: header, mappedTo: column.propertyName, as: 'relation' };
  }
  const converts = RULE_DESCRIPTIONS[column.coercion];
  return {
    column: header,
    mappedTo: column.propertyName,
    as: 'value',
    ...(converts ? { converts } : {}),
  };
}

function toDigest(importId: string, mapping: ImportMapping, session: ImportSession): ProposeImportMappingOutput {
  const headers = session.table.headers;
  return {
    importId,
    fileName: session.fileName,
    rowCount: session.table.rowCount,
    type: mapping.typeName,
    nameColumn: headers[mapping.nameColumn] ?? `Column ${mapping.nameColumn + 1}`,
    columns: mapping.columns.map(column =>
      describeColumn(column, headers[column.index] ?? `Column ${column.index + 1}`)
    ),
    skippedCount: mapping.columns.filter(c => c.kind === 'skip').length,
    reviewableCount: mapping.columns.filter(c => c.kind === 'skip' && c.hadCandidates).length,
    summary: mapping.summary,
    raggedRows: session.raggedRows,
  };
}

async function fetchMapping(
  input: ProposeImportMappingInput,
  searchSpaceIds: string[],
  currentSpaceId: string | null,
  signal: AbortSignal
): Promise<ProposeImportMappingOutput> {
  const session = await ImportSessions.get(input.importId);
  if (!session) return { error: 'unknown_import' };

  // Where the user is *now*, not where the file was attached.
  //
  // The space is an input to the mapping, not just a permission: the sub-agent
  // lists that space's types first and prefers its properties over the
  // canonical ones. Mapping against the attach-time space meant a file attached
  // on Root kept being mapped for Root no matter where the user went, and the
  // only way out was to attach it again.
  const targetSpaceId = currentSpaceId ?? session.spaceId;

  const body = {
    spaceId: targetSpaceId,
    fileName: session.fileName,
    rowCount: session.table.rowCount,
    columns: sampleColumns(session.table),
    // Where to look for types and properties. Computed here because the
    // membership list only exists on the client — the same source the
    // standalone importer used, so an import sees the ontology the rest of the
    // app already shows this user. Without it, a property sitting in a space
    // they can edit is reported as "does not exist" and the column is dropped.
    searchSpaceIds,
    ...(input.hint ? { hint: input.hint.slice(0, 400) } : {}),
  };

  try {
    const res = await fetch('/api/chat/import-map', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });

    if (res.status === 401) return { error: 'not_signed_in' };
    if (res.status === 429) return { error: 'rate_limited' };
    if (res.status === 504) return { error: 'timed_out' };
    if (!res.ok) {
      console.error('[chat/import-dispatcher] non-ok', res.status);
      return { error: 'mapping_failed' };
    }

    const output = (await res.json()) as ImportMapOutput;
    if ('error' in output) {
      const known: ImportToolError[] = ['no_types_in_space', 'mapping_failed'];
      const error = known.includes(output.error as ImportToolError)
        ? (output.error as ImportToolError)
        : 'mapping_failed';
      return { error };
    }

    await rememberMapping(input.importId, output, targetSpaceId);
    return toDigest(input.importId, output, session);
  } catch (err) {
    if (signal.aborted) return { error: 'aborted' };
    console.error('[chat/import-dispatcher] mapping fetch failed', err);
    return { error: 'mapping_failed' };
  }
}

/** Turn per-column tallies into at most a couple of sentences worth relaying. */
function conversionNotes(result: Extract<ApplyResult, { ok: true }>): string[] {
  const notes: string[] = [];
  for (const column of result.columns) {
    const { unconvertible, placeholder, examples } = column.report;
    if (unconvertible === 0 && placeholder === 0) continue;

    const parts: string[] = [];
    if (placeholder > 0) parts.push(`${placeholder} had no value`);
    if (unconvertible > 0) {
      const shown = examples.length > 0 ? ` (e.g. ${examples.map(e => `"${e}"`).join(', ')})` : '';
      parts.push(`${unconvertible} could not be read${shown}`);
    }
    notes.push(`${column.header}: ${parts.join('; ')} — left blank`);
  }
  return notes;
}

export function useImportDispatcher(
  messages: UIMessage[],
  addToolResultRef: React.RefObject<AddImportResultFn | null>,
  currentSpaceId: string | null
) {
  const dispatchedRef = React.useRef(new Set<string>());
  const abortRef = React.useRef<AbortController | null>(null);
  const { store } = useSyncEngine();
  const storeRef = React.useRef(store);
  storeRef.current = store;

  // Root, current, personal, and every space this user can edit — read through
  // a ref so a dispatch started before the sidebar settles still sees the
  // final list rather than a partial one baked in at render.
  const searchSpaceIds = useGlobalSearchSpaceIds();
  const searchSpaceIdsRef = React.useRef(searchSpaceIds);
  searchSpaceIdsRef.current = searchSpaceIds;

  // Read through a ref for the same reason, and for one more: a dispatch is
  // queued from a `messages` effect, so reading the space at render time would
  // pin whichever space the user happened to be in when the tool call arrived
  // rather than the one they are in when it runs.
  const currentSpaceIdRef = React.useRef(currentSpaceId);
  currentSpaceIdRef.current = currentSpaceId;

  React.useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    return () => controller.abort();
  }, []);

  // Spreadsheets left behind by abandoned imports shouldn't sit on disk
  // forever. Once per mount is enough — this is housekeeping, not a guarantee.
  React.useEffect(() => {
    void ImportSessions.sweepExpired();
  }, []);

  React.useEffect(() => {
    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      for (const part of message.parts) {
        if (!isToolUIPart(part)) continue;
        if (part.type !== PROPOSE_TOOL_PART && part.type !== APPLY_TOOL_PART) continue;
        if (part.state !== 'input-available') continue;
        if (dispatchedRef.current.has(part.toolCallId)) continue;
        dispatchedRef.current.add(part.toolCallId);

        const toolCallId = part.toolCallId;
        const isPropose = part.type === PROPOSE_TOOL_PART;
        const input = ((part as { input?: unknown }).input ?? {}) as ProposeImportMappingInput & ApplyImportInput;

        enqueue(async () => {
          const signal = abortRef.current?.signal;
          if (!signal || signal.aborted) return;

          if (isPropose) {
            let output: ProposeImportMappingOutput;
            try {
              output = await fetchMapping(input, searchSpaceIdsRef.current, currentSpaceIdRef.current, signal);
            } catch (err) {
              console.error('[chat/import-dispatcher] propose threw', err);
              output = { error: 'mapping_failed' };
            }
            addToolResultRef.current?.({ tool: 'proposeImportMapping', toolCallId, output });
            return;
          }

          let output: ApplyImportOutput;
          try {
            output = await runApply(input.importId, storeRef.current, currentSpaceIdRef.current, signal);
          } catch (err) {
            console.error('[chat/import-dispatcher] apply threw', err);
            output = { error: 'apply_failed' };
          }
          addToolResultRef.current?.({ tool: 'applyImport', toolCallId, output });
        });
      }
    }
  }, [messages, addToolResultRef]);
}

type SyncStore = ReturnType<typeof useSyncEngine>['store'];

/**
 * The same gate every edit tool passes — member of this space, inside the edit
 * rate limit. Staging a few thousand rows is the largest write the assistant
 * can make, so it is the last one that should skip the check.
 */
type AuthorizeOutput = { ok: true } | EditToolFailure;

async function authorizeImport(spaceId: string, signal: AbortSignal): Promise<AuthorizeOutput> {
  try {
    const res = await fetch('/api/chat/authorize-write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spaceId, toolName: 'applyImport' }),
      signal,
    });
    // 200 + `ok: false` is an expected denial carrying its own reason; a
    // non-200 is transport or server fault. Same split the edit dispatcher makes.
    if (!res.ok) {
      console.error('[chat/import-dispatcher] authorize-write non-ok', res.status);
      return notSignedIn();
    }
    return (await res.json()) as AuthorizeOutput;
  } catch (err) {
    console.error('[chat/import-dispatcher] authorize-write threw', err);
    return notSignedIn();
  }
}

/**
 * An earlier staging of this same file, whose edits are still in the review panel.
 *
 * "Still there" is asked of the store rather than remembered, because publishing
 * happens outside this module entirely: the probe value is one the earlier
 * import wrote, and it survives exactly as long as those edits stay unpublished.
 * A marker with no probe staged nothing, so there is nothing to collide with.
 *
 * Scoped to the space being written to, not the one the file was attached in:
 * the same spreadsheet imported into two different spaces is two legitimate
 * imports, and only a second copy in the *same* space is the duplicate.
 */
async function findPendingImport(
  session: ImportSession,
  targetSpaceId: string,
  store: SyncStore
): Promise<ApplyImportOutput | null> {
  const stored = session as StoredImportSession;
  if (!stored.fingerprint) return null;

  const matches = await ImportSessions.stagedMatches(stored.fingerprint, targetSpaceId, session.id);

  for (const match of matches) {
    const probe = match.staged?.probe;
    if (!probe) continue;
    if (!store.getValue(probe.valueId, probe.entityId)) continue;

    return {
      error: 'already_staged',
      fileName: match.fileName,
      stagedAt: match.staged!.at,
      entityCount: match.staged!.entityCount,
    };
  }

  return null;
}

/**
 * Where this import should land, and whether the mapping still fits it.
 *
 * Three ids meet here and they are easy to confuse:
 *
 * - `currentSpaceId` — where the user is standing. The target, when we have it.
 * - `attachedSpaceId` — where the file was dropped. Only a fallback now; the
 *   import used to be pinned to it, which is what stranded a file attached in a
 *   space the user could not write to.
 * - `mappedForSpaceId` — the ontology the mapping was built from. A mapping
 *   made for Root lists Root's types first and prefers Root's properties, so
 *   applying it elsewhere links columns to the wrong things and succeeds while
 *   doing it.
 *
 * Normalized before comparing: one side comes from a route param and the other
 * from storage, and a dashed id on either would make every apply look like a
 * space change. A mapping stored before the space was tracked has no
 * `mappedForSpaceId`; it is assumed to belong to the space it was attached in,
 * which is where it would have been built.
 */
export function resolveImportTarget(args: {
  currentSpaceId: string | null;
  attachedSpaceId: string;
  mappedForSpaceId: string | null;
}): { targetSpaceId: string; mappedForSpaceId: string; stale: boolean } {
  const targetSpaceId = args.currentSpaceId ?? args.attachedSpaceId;
  const mappedForSpaceId = args.mappedForSpaceId ?? args.attachedSpaceId;

  return {
    targetSpaceId,
    mappedForSpaceId,
    stale: normalizeSpaceId(mappedForSpaceId) !== normalizeSpaceId(targetSpaceId),
  };
}

async function runApply(
  importId: string,
  store: SyncStore,
  currentSpaceId: string | null,
  signal: AbortSignal
): Promise<ApplyImportOutput> {
  const session = await ImportSessions.get(importId);
  if (!session) return { error: 'unknown_import' };

  const stored = await ImportSessions.getMapping(importId);
  if (!stored) return { error: 'no_mapping_yet' };
  const { mapping } = stored;

  const { targetSpaceId, mappedForSpaceId, stale } = resolveImportTarget({
    currentSpaceId,
    attachedSpaceId: session.spaceId,
    mappedForSpaceId: stored.spaceId,
  });

  if (stale) {
    return { error: 'space_changed', mappedForSpaceId, currentSpaceId: targetSpaceId };
  }

  // Has this exact file already been staged into this space and not yet
  // published? Attaching a spreadsheet twice makes two sessions with two ids,
  // so nothing used to connect them, and the second apply wrote every value and
  // relation again on top of the first.
  const alreadyStaged = await findPendingImport(session, targetSpaceId, store);
  if (alreadyStaged) return alreadyStaged;

  const authorized = await authorizeImport(targetSpaceId, signal);
  if (!authorized.ok) {
    // The reason travels, it is not flattened. Reporting "not authorized" as
    // "you need to sign in" sent a signed-in user round a loop — sign in
    // again, still refused, refresh as advised, and the refresh used to take
    // the parsed file with it.
    if (authorized.error === 'not_authorized') {
      return { error: 'not_authorized', spaceId: authorized.spaceId ?? targetSpaceId };
    }
    if (authorized.error === 'rate_limited') {
      return { error: 'rate_limited', retryAfter: authorized.retryAfter };
    }
    return { error: 'not_signed_in' };
  }
  if (signal.aborted) return { error: 'aborted' };

  const result = await applyImportToStore({
    session,
    mapping,
    spaceId: targetSpaceId,
    guard: { isCurrent: () => !signal.aborted },
    deps: {
      getResolvedRelations: (entityId: string) => store.getResolvedRelations(entityId),
      getStoreProperty: (propertyId: string) => store.getProperty(propertyId),
    },
  });

  if (!result.ok) {
    return { error: result.error === 'aborted' ? 'aborted' : 'apply_failed' };
  }

  await ImportSessions.markStaged(importId, {
    at: Date.now(),
    spaceId: targetSpaceId,
    entityCount: result.entityCount,
    probe: result.probe,
  });

  return {
    staged: true,
    entityCount: result.entityCount,
    editCount: result.editCount,
    typeName: result.typeName,
    ambiguousRows: result.ambiguousRows,
    unresolvedRelations: result.unresolvedRelations,
    conversionNotes: conversionNotes(result),
  };
}
