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
 * A file is a set of tabs, and both tools cover all of them at once: the
 * mapping sub-agent runs once per tab in parallel, and the apply stages the tabs
 * in dependency order so a tab can link to rows of another tab in the same file.
 *
 * Mirrors `geo-query-dispatcher.ts` — every dispatched call is answered exactly
 * once, because an unanswered tool call leaves the panel spinning with nothing
 * to resolve it.
 */
import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { type UIMessage, isToolUIPart } from 'ai';

import { normalizeSpaceId } from '~/core/access/space-access';
import { useGlobalSearchSpaceIds } from '~/core/hooks/use-global-search-space-ids';
import { useSyncEngine } from '~/core/sync/use-sync-engine';

import { splitRelationCell } from '~/partials/import/relation-cell';

import { enqueue } from './apply-queue';
import { type EditToolFailure } from './edit-types';
import { type ApplyResult, type KnownEntity, commitWorkbook, prepareWorkbook } from './import/apply';
import type { ImportMapOutput, ImportMapping, LocalImportOntology, MappedColumn } from './import/mapping-types';
import { summarizeMapping } from './import/mapping-validation';
import {
  type ImportSession,
  ImportSessions,
  type ImportSheet,
  type SheetMappings,
  type StoredImportSession,
  sampleColumns,
} from './import/session';
import type {
  ApplyImportInput,
  ApplyImportOutput,
  ImportToolError,
  MappingDigestColumn,
  ProposeImportMappingInput,
  ProposeImportMappingOutput,
  SheetApplyDigest,
  SheetMappingDigest,
} from './import/tool-types';

const PROPOSE_TOOL_PART = 'tool-proposeImportMapping';
const APPLY_TOOL_PART = 'tool-applyImport';

export type AddImportResultFn = (args: { tool: string; toolCallId: string; output: unknown }) => void;

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
      ...(column.suggestedProperty ? { suggestedProperty: column.suggestedProperty } : {}),
    };
  }
  if (column.kind === 'relation') {
    return {
      column: header,
      mappedTo: column.propertyName,
      propertyId: column.propertyId,
      as: 'relation',
      targetTypes: column.relationTypeNames ?? [],
    };
  }
  const converts = RULE_DESCRIPTIONS[column.coercion];
  return {
    column: header,
    mappedTo: column.propertyName,
    propertyId: column.propertyId,
    as: 'value',
    ...(converts ? { converts } : {}),
  };
}

function sheetDigest(sheet: ImportSheet, mapping: ImportMapping): SheetMappingDigest {
  const headers = sheet.table.headers;
  return {
    sheet: sheet.name,
    rowCount: sheet.table.rowCount,
    type: mapping.typeName,
    typeId: mapping.typeId,
    nameColumn: headers[mapping.nameColumn] ?? `Column ${mapping.nameColumn + 1}`,
    columns: mapping.columns.map(column =>
      describeColumn(column, headers[column.index] ?? `Column ${column.index + 1}`)
    ),
    skippedCount: mapping.columns.filter(c => c.kind === 'skip').length,
    reviewableCount: mapping.columns.filter(c => c.kind === 'skip' && c.hadCandidates).length,
    summary: summarizeMapping(mapping, headers[mapping.nameColumn] ?? 'Name'),
    raggedRows: sheet.raggedRows,
    skippedLeadingRows: sheet.skippedLeadingRows,
  };
}

function toDigest(
  session: ImportSession,
  mappings: SheetMappings,
  excludedSheets: string[],
  spaceId: string
): ProposeImportMappingOutput {
  const linkWarnings = workbookLinkWarnings(
    session.sheets.filter(sheet => !excludedSheets.includes(sheet.name)),
    mappings
  );
  return {
    importId: session.id,
    status: 'preview',
    canApply:
      linkWarnings.length === 0 &&
      session.sheets.some(sheet => !excludedSheets.includes(sheet.name) && mappings[sheet.name]),
    linkWarnings,
    requiresConfirmation: true,
    fileName: session.fileName,
    spaceId,
    sheets: session.sheets
      .filter(sheet => !excludedSheets.includes(sheet.name) && mappings[sheet.name])
      .map(sheet => sheetDigest(sheet, mappings[sheet.name])),
    excludedSheets,
    skippedSheets: session.skippedSheets.map(sheet => ({ sheet: sheet.name, reason: sheet.reason })),
  };
}

/** The tab the model named, allowing for case and stray spaces. */
export function findSheet(session: ImportSession, name: string): ImportSheet | null {
  const exact = session.sheets.find(sheet => sheet.name === name);
  if (exact) return exact;
  const wanted = name.trim().toLowerCase();
  return session.sheets.find(sheet => sheet.name.trim().toLowerCase() === wanted) ?? null;
}

async function mapSheet(
  sheet: ImportSheet,
  session: ImportSession,
  spaceId: string,
  searchSpaceIds: string[],
  hint: string | undefined,
  signal: AbortSignal,
  localOntology?: LocalImportOntology,
  previousMapping?: ImportMapping
): Promise<ImportMapping | { error: ImportToolError; message?: string }> {
  const body = {
    spaceId,
    fileName: session.sheets.length > 1 ? `${session.fileName} — ${sheet.name}` : session.fileName,
    rowCount: sheet.table.rowCount,
    columns: sampleColumns(sheet.table),
    // Where to look for types and properties. Computed here because the
    // membership list only exists on the client — the same source the
    // standalone importer used, so an import sees the ontology the rest of the
    // app already shows this user. Without it, a property sitting in a space
    // they can edit is reported as "does not exist" and the column is dropped.
    searchSpaceIds,
    localOntology,
    previousMapping,
    workbookSheets: session.sheets.map(tab => ({
      name: tab.name,
      nameSamples:
        sampleColumns(tab.table).find(column => /^(name|title)$/i.test(column.header))?.samples ??
        sampleColumns(tab.table)[0]?.samples ??
        [],
    })),
    ...(hint ? { hint: hint.slice(0, 400) } : {}),
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
      const known: ImportToolError[] = ['no_types_in_space', 'mapping_failed', 'ontology_change_required'];
      return {
        error: known.includes(output.error as ImportToolError) ? (output.error as ImportToolError) : 'mapping_failed',
        message: output.message,
      };
    }
    return output;
  } catch (err) {
    if (signal.aborted) return { error: 'aborted' };
    console.error('[chat/import-dispatcher] mapping fetch failed', err);
    return { error: 'mapping_failed' };
  }
}

/**
 * Tabs mapped at once. Each mapping is a sub-agent run of half a minute or
 * more; three in flight keeps a six-tab workbook to two rounds without
 * pushing any one run past the route's time budget.
 */
const MAPPING_CONCURRENCY = 3;

async function mapInBatches<T, R>(items: T[], run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += MAPPING_CONCURRENCY) {
    results.push(...(await Promise.all(items.slice(i, i + MAPPING_CONCURRENCY).map(run))));
  }
  return results;
}

async function fetchMapping(
  input: ProposeImportMappingInput,
  searchSpaceIds: string[],
  currentSpaceId: string | null,
  signal: AbortSignal,
  store: SyncStore
): Promise<ProposeImportMappingOutput> {
  const session = await ImportSessions.get(input.importId);
  if (!session) return { error: 'unknown_import' };

  // The space the user named, else where they are *now*, else where the file
  // was attached.
  //
  // The space is an input to the mapping, not just a permission: the sub-agent
  // lists that space's types first and prefers its properties over the
  // canonical ones. Mapping against the attach-time space meant a file attached
  // on Root kept being mapped for Root no matter where the user went, and the
  // only way out was to attach it again.
  const targetSpaceId = normalizeSpaceId(input.spaceId ?? currentSpaceId ?? session.spaceId);
  const stored = await ImportSessions.getMapping(input.importId);
  const sameSpace = stored?.mappedForSpaceId != null && normalizeSpaceId(stored.mappedForSpaceId) === targetSpaceId;
  const availableSheets = session.sheets.map(sheet => sheet.name);

  const excludedSheets: string[] = [];
  for (const name of input.excludeSheets ?? stored?.excludedSheets ?? []) {
    const sheet = findSheet(session, name);
    if (!sheet) return { error: 'unknown_sheet', sheet: name, availableSheets };
    if (!excludedSheets.includes(sheet.name)) excludedSheets.push(sheet.name);
  }

  let only: ImportSheet | null = null;
  if (input.sheet) {
    only = findSheet(session, input.sheet);
    if (!only) return { error: 'unknown_sheet', sheet: input.sheet, availableSheets };
  }

  const included = session.sheets.filter(sheet => !excludedSheets.includes(sheet.name));
  // A one-tab correction only makes sense against mappings built for the same
  // space; if the target moved, every tab has to be rebuilt.
  // Inclusion changes preserve existing mappings even if the model repeats
  // "keep the mappings" in a hint. A remap must name a sheet/column or be a
  // separate request without excludeSheets.
  const exclusionsOnly = input.excludeSheets !== undefined && !input.columns?.length && !only;
  const toMap =
    sameSpace && stored && exclusionsOnly
      ? included.filter(sheet => !stored.mappings[sheet.name])
      : only && sameSpace
        ? [only]
        : included;

  const localOntology = localImportOntology(store, targetSpaceId);
  const correctedIndices = new Map<string, Set<number>>();
  if (input.columns?.length) {
    for (const sheet of toMap) {
      const indices = new Set<number>();
      for (const header of input.columns) {
        const matches = sheet.table.headers.flatMap((name, index) =>
          name.trim().toLowerCase() === header.trim().toLowerCase() ? [index] : []
        );
        if (matches.length !== 1)
          return {
            error: 'unknown_column',
            sheet: sheet.name,
            message: `Column ${header} must match exactly one header in ${sheet.name}.`,
          };
        indices.add(matches[0]);
      }
      correctedIndices.set(sheet.name, indices);
    }
  }
  const results = await mapInBatches(toMap, sheet =>
    mapSheet(
      sheet,
      session,
      targetSpaceId,
      searchSpaceIds,
      input.hint,
      signal,
      localOntology,
      sameSpace ? stored?.mappings[sheet.name] : undefined
    )
  );
  const mappings: SheetMappings = sameSpace && stored ? { ...stored.mappings } : {};
  for (let i = 0; i < toMap.length; i++) {
    const result = results[i];
    const sheet = toMap[i];
    if ('error' in result) return { error: result.error, message: result.message, sheet: sheet.name };
    const previous = sameSpace ? stored?.mappings[sheet.name] : undefined;
    const indices = correctedIndices.get(sheet.name);
    mappings[sheet.name] = previous && indices ? mergeColumnCorrection(previous, result, indices) : result;
  }
  if (signal.aborted) return { error: 'aborted' };
  await ImportSessions.setMapping(input.importId, { mappings, mappedForSpaceId: targetSpaceId, excludedSheets });
  return toDigest(session, mappings, excludedSheets, targetSpaceId);
}

/** Only pending ontology from this target space; apply checks its real store definition again. */
export function localImportOntology(store: SyncStore, spaceId: string): LocalImportOntology {
  const entities = store
    .getEntities({ spaceId })
    .filter(entity =>
      [...entity.values, ...entity.relations].some(
        item => item.spaceId === spaceId && item.isLocal && !item.hasBeenPublished && !item.isDeleted
      )
    );
  return {
    types: entities
      .filter(entity => entity.types.some(type => type.id === SystemIds.SCHEMA_TYPE))
      .slice(-100)
      .map(entity => ({ id: entity.id, name: entity.name })),
    properties: entities
      .flatMap(entity => {
        const property = store.getProperty(entity.id, { spaceId });
        return property
          ? [
              {
                id: property.id,
                name: property.name,
                dataType: property.dataType,
                renderableTypeStrict: property.renderableTypeStrict,
                relationValueTypes: property.relationValueTypes ?? [],
              },
            ]
          : [];
      })
      .slice(-100),
  };
}

export function mergeColumnCorrection(
  previous: ImportMapping,
  next: ImportMapping,
  indices: ReadonlySet<number>
): ImportMapping {
  return {
    ...previous,
    summary: 'Updated the requested columns; kept the row type and all other mappings unchanged.',
    columns: previous.columns.map(column =>
      indices.has(column.index) ? (next.columns.find(c => c.index === column.index) ?? column) : column
    ),
  };
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
  const controllers = React.useRef(new Map<string, AbortController>());
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
    const active = controllers.current;
    const dispatched = dispatchedRef.current;
    return () => {
      for (const [id, controller] of active) {
        controller.abort();
        dispatched.delete(id);
      }
      active.clear();
    };
  }, []);

  // Spreadsheets left behind by abandoned imports shouldn't sit on disk
  // forever. Once per mount is enough — this is housekeeping, not a guarantee.
  React.useEffect(() => {
    void ImportSessions.sweepExpired();
  }, []);

  React.useEffect(() => {
    const pending = new Set(
      messages.flatMap(message =>
        message.parts.flatMap(part => (isToolUIPart(part) && part.state === 'input-available' ? [part.toolCallId] : []))
      )
    );
    for (const [id, controller] of controllers.current) {
      if (!pending.has(id)) {
        controller.abort();
        controllers.current.delete(id);
      }
    }
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

        const controller = new AbortController();
        controllers.current.set(toolCallId, controller);
        enqueue(async () => {
          const signal = controller.signal;
          if (signal.aborted) return;

          if (isPropose) {
            let output: ProposeImportMappingOutput;
            try {
              output = await fetchMapping(
                input,
                searchSpaceIdsRef.current,
                currentSpaceIdRef.current,
                signal,
                storeRef.current
              );
            } catch (err) {
              console.error('[chat/import-dispatcher] propose threw', err);
              output = { error: 'mapping_failed' };
            }
            if (!signal.aborted) addToolResultRef.current?.({ tool: 'proposeImportMapping', toolCallId, output });
            return;
          }

          let output: ApplyImportOutput;
          try {
            output = await runApply(input, storeRef.current, currentSpaceIdRef.current, signal);
          } catch (err) {
            console.error('[chat/import-dispatcher] apply threw', err);
            output = { error: 'apply_failed' };
          }
          if (!signal.aborted) addToolResultRef.current?.({ tool: 'applyImport', toolCallId, output });
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
      return { ok: false, error: 'lookup_failed', message: 'Could not verify write access. Please retry.' };
    }
    return (await res.json()) as AuthorizeOutput;
  } catch (err) {
    console.error('[chat/import-dispatcher] authorize-write threw', err);
    return { ok: false, error: 'lookup_failed', message: 'Could not verify write access. Please retry.' };
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

  const matches = await ImportSessions.stagedMatches(stored.fingerprint, targetSpaceId);

  for (const match of matches) {
    const marker = match.staged!;
    const pendingValue = (marker.values ?? (marker.probe ? [marker.probe] : [])).some(probe => {
      const value = store.getValue(probe.valueId, probe.entityId);
      return value && value.isLocal && !value.isDeleted && !value.hasBeenPublished;
    });
    const pendingRelation = (marker.relations ?? []).some(probe => {
      const relation = store.getRelation(probe.relationId, probe.entityId);
      return relation && relation.isLocal && !relation.isDeleted && !relation.hasBeenPublished;
    });
    if (!pendingValue && !pendingRelation) continue;

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
 * - `currentSpaceId` — where the user is standing, or the space they named.
 *   The target, when we have it.
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

/** Explain type conflicts before confirmation; names alone never prove two entities are identical. */
export function workbookLinkWarnings(sheets: ImportSheet[], mappings: SheetMappings): string[] {
  const warnings = new Set<string>();
  for (const sheet of sheets) {
    const mapping = mappings[sheet.name];
    if (!mapping) continue;
    for (const column of mapping.columns) {
      if (column.kind !== 'relation' || column.relationTypeIds.length === 0) continue;
      const values = new Set(
        sheet.table.rows.flatMap(row =>
          splitRelationCell(row[column.index] ?? '', column.split).map(value => value.trim().toLowerCase())
        )
      );
      for (const other of sheets) {
        if (other.name === sheet.name || !mappings[other.name]) continue;
        const otherMapping = mappings[other.name];
        if (column.relationTypeIds.includes(otherMapping.typeId)) continue;
        const compatibleNames = new Set(
          sheets
            .filter(tab => mappings[tab.name] && column.relationTypeIds.includes(mappings[tab.name].typeId))
            .flatMap(tab => [...nameValues(tab, mappings[tab.name])])
        );
        if (![...nameValues(other, otherMapping)].some(name => values.has(name) && !compatibleNames.has(name)))
          continue;
        warnings.add(
          `${sheet.name}.${sheet.table.headers[column.index]} names rows in ${other.name}, but its target type (${column.relationTypeNames?.join(', ') || 'a different type'}) does not match ${otherMapping.typeName}. Import is blocked until these mappings are aligned; confirmation cannot bypass this.`
        );
      }
    }
  }
  return [...warnings];
}

function nameValues(sheet: ImportSheet, mapping: ImportMapping): Set<string> {
  const names = new Set<string>();
  for (const row of sheet.table.rows) {
    const name = (row[mapping.nameColumn] ?? '').trim().toLowerCase();
    if (name) names.add(name);
  }
  return names;
}

/**
 * The order tabs are staged in: a tab whose relation cells name rows of
 * another tab comes after it, so those rows exist to link to. Ties keep the
 * workbook's order, and a cycle falls back to it.
 */
export function orderSheets(sheets: ImportSheet[], mappings: SheetMappings): ImportSheet[] {
  const names = sheets.map(sheet => nameValues(sheet, mappings[sheet.name]));
  const dependsOn = sheets.map(() => new Set<number>());

  sheets.forEach((sheet, i) => {
    for (const column of mappings[sheet.name].columns) {
      if (column.kind !== 'relation') continue;
      const values = new Set<string>();
      for (const row of sheet.table.rows) {
        const raw = (row[column.index] ?? '').trim();
        if (!raw) continue;
        for (const part of splitRelationCell(raw, column.split)) values.add(part.trim().toLowerCase());
      }
      sheets.forEach((_, j) => {
        if (j === i || dependsOn[i].has(j)) return;
        for (const value of values) {
          if (names[j].has(value)) {
            dependsOn[i].add(j);
            break;
          }
        }
      });
    }
  });

  const ordered: ImportSheet[] = [];
  const placed = new Set<number>();
  while (placed.size < sheets.length) {
    let next = sheets.findIndex((_, i) => !placed.has(i) && [...dependsOn[i]].every(j => placed.has(j)));
    if (next === -1) next = sheets.findIndex((_, i) => !placed.has(i));
    placed.add(next);
    ordered.push(sheets[next]);
  }
  return ordered;
}

async function runApply(
  input: ApplyImportInput,
  store: SyncStore,
  currentSpaceId: string | null,
  signal: AbortSignal
): Promise<ApplyImportOutput> {
  const session = await ImportSessions.get(input.importId);
  if (!session) return { error: 'unknown_import' };

  const stored = await ImportSessions.getMapping(input.importId);
  if (!stored) return { error: 'no_mapping_yet' };

  const { targetSpaceId, mappedForSpaceId, stale } = resolveImportTarget({
    currentSpaceId: input.spaceId ?? currentSpaceId,
    attachedSpaceId: session.spaceId,
    mappedForSpaceId: stored.mappedForSpaceId,
  });

  if (stale) {
    return { error: 'space_changed', mappedForSpaceId, currentSpaceId: targetSpaceId };
  }

  const included = session.sheets.filter(sheet => !stored.excludedSheets.includes(sheet.name));
  if (included.length === 0)
    return { error: 'nothing_to_import', message: 'Every sheet is excluded. Include a sheet before importing.' };
  for (const sheet of included) {
    if (!stored.mappings[sheet.name]) return { error: 'no_mapping_yet', sheet: sheet.name };
  }

  const linkWarnings = workbookLinkWarnings(included, stored.mappings);
  if (linkWarnings.length) return { error: 'invalid_mapping', message: linkWarnings.join(' ') };

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
    return authorized.error === 'not_signed_in'
      ? { error: 'not_signed_in' }
      : { error: 'apply_failed', message: authorized.message ?? 'Could not verify write access. Please retry.' };
  }
  if (signal.aborted) return { error: 'aborted' };

  const guard = { isCurrent: () => !signal.aborted };
  const pendingEntities = new Map<string, KnownEntity[]>();
  for (const entity of store.getEntities({ spaceId: targetSpaceId })) {
    if (
      !entity.name ||
      ![...entity.values, ...entity.relations].some(
        item => item.spaceId === targetSpaceId && item.isLocal && !item.hasBeenPublished && !item.isDeleted
      )
    )
      continue;
    const key = entity.name.trim().toLowerCase();
    const known = pendingEntities.get(key) ?? [];
    known.push({ id: entity.id, name: entity.name, typeIds: entity.types.map(type => type.id) });
    pendingEntities.set(key, known);
  }
  const plan = await prepareWorkbook({
    sheets: included.map(sheet => ({ table: sheet.table, mapping: stored.mappings[sheet.name] })),
    spaceId: targetSpaceId,
    guard,
    knownEntities: pendingEntities,
    deps: {
      getResolvedRelations: id => store.getResolvedRelations(id),
      getStoreProperty: id => store.getProperty(id, { spaceId: targetSpaceId }),
    },
  });
  if (!plan.ok)
    return {
      error: plan.error,
      message: plan.message,
      ...(plan.sheetIndex !== undefined ? { sheet: included[plan.sheetIndex].name } : {}),
    };
  if (!commitWorkbook(plan, guard)) return { error: 'aborted' };
  const entityCount = new Set(plan.results.flatMap(result => result.rows.map(row => row.id))).size;
  const editCount = plan.values.length + plan.relations.length;
  const sheets: SheetApplyDigest[] = plan.results.map((result, i) => ({
    sheet: included[i].name,
    typeName: result.typeName,
    entityCount: result.entityCount,
    linkedEntityCount: result.linkedEntityCount,
    editCount: result.editCount,
    ambiguousRows: result.ambiguousRows,
    unresolvedRelations: result.unresolvedRelations,
    crossSheetLinks: result.crossSheetLinks,
    conversionNotes: conversionNotes(result),
  }));
  const first = plan.values[0];
  await ImportSessions.markStaged(input.importId, {
    at: Date.now(),
    spaceId: targetSpaceId,
    entityCount,
    probe: first ? { valueId: first.id, entityId: first.entity.id } : null,
    values: plan.values.map(value => ({ valueId: value.id, entityId: value.entity.id })),
    relations: plan.relations.map(relation => ({ relationId: relation.id, entityId: relation.fromEntity.id })),
  });
  const rowIds = new Set(plan.results.flatMap(result => result.rows.map(row => row.id)));
  const linkedEntityCount = new Set(
    plan.values
      .filter(value => value.property.id === SystemIds.NAME_PROPERTY && !rowIds.has(value.entity.id))
      .map(value => value.entity.id)
  ).size;
  return {
    staged: true,
    spaceId: targetSpaceId,
    entityCount,
    linkedEntityCount,
    editCount,
    sheets,
    countScope:
      'entityCount counts distinct imported row entities; linkedEntityCount counts additional new linked entities. Earlier pending edits, including ontology creation, are excluded. crossSheetLinks counts newly staged relation edges between workbook tabs, not distinct target entities.',
  };
}
