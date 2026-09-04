'use client';

/**
 * Turning an approved mapping into staged edits.
 *
 * This is the bridge, not a new engine. Resolution, plan-building and image
 * upload already exist in `partials/import/` and are good — batched at 200
 * names, four concurrent, abort-guarded, with a five-level tiebreak. What they
 * never had was a caller that could tell them what a column *means*.
 *
 * So this module does three things the standalone importer could not:
 *
 * 1. Coerces every value column before the engine sees it, so nothing reaches
 *    `parseInt(val, 10) || 0` in a shape that would silently become `0`.
 * 2. Fills in `relationValueTypes` where the ontology leaves them empty — the
 *    gap that makes the resolver's type filter a no-op and lets a well-linked
 *    Project win a `Founders` column.
 * 3. Writes through `storage.*.set` rather than `makeBulkProposal`, so the
 *    result lands in the review panel as staged edits the user publishes
 *    themselves.
 */
import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { Effect } from 'effect';

import { getProperties } from '~/core/io/queries';
import { storage } from '~/core/sync/use-mutate';
import type { Property, Relation, Value } from '~/core/types';

import {
  type RelationSplitRules,
  buildImportPlan,
  collectRelationCells,
  hydrateRelationValueTypes,
} from '~/partials/import/import-generation';
import { resolveRelationEntities, resolveRowsByNameAndType } from '~/partials/import/import-resolution';

import { type ColumnCoercionReport, coerce } from './coerce';
import type { ImportMapping, MappedRelationColumn, MappedValueColumn } from './mapping-types';
import type { ImportSession } from './session';
import type { ParsedTable } from './types';

export type ApplyProgress = {
  stage: 'preparing' | 'converting' | 'linking' | 'matching' | 'building' | 'staging';
  /** Human-readable, safe to show verbatim. */
  message: string;
};

export type ColumnOutcome = {
  index: number;
  header: string;
  propertyName: string;
  report: ColumnCoercionReport;
};

export type ApplyResult =
  | {
      ok: true;
      /** Entities that will be created or updated. */
      entityCount: number;
      /** Values + relations written to the local store. */
      editCount: number;
      /** Rows dropped because their name matched several entities and none could be preferred. */
      ambiguousRows: number;
      /** Relation cells that matched nothing usable. */
      unresolvedRelations: number;
      /** Per-column conversion tallies, for the assistant's summary. */
      columns: ColumnOutcome[];
      typeName: string;
      /**
       * One value this import wrote, so a later run can ask whether these edits
       * are still pending. Null only if the import staged nothing at all.
       */
      probe: { valueId: string; entityId: string } | null;
    }
  | { ok: false; error: 'aborted' | 'no_name_column' | 'apply_failed' };

/** Matches the shape the resolution functions expect without importing their private type. */
type Guard = { isCurrent: () => boolean };

/**
 * Rewrite the table with every value column converted.
 *
 * Cells that can't be converted — and cells that said "N/A" — become the empty
 * string, which is exactly how the existing engine already represents "nothing
 * here": `buildGeneratedRows` does `if (!raw) continue`. So "write no value at
 * all" falls out of the engine's own behaviour rather than needing a new branch
 * in it, and there is no path by which a placeholder becomes a `0`.
 */
export function coerceTable(
  table: ParsedTable,
  mapping: ImportMapping
): { rows: string[][]; reports: Map<number, ColumnCoercionReport> } {
  const valueColumns = mapping.columns.filter((c): c is MappedValueColumn => c.kind === 'value');
  const reports = new Map<number, ColumnCoercionReport>();

  for (const column of valueColumns) {
    reports.set(column.index, { converted: 0, placeholder: 0, unconvertible: 0, examples: [] });
  }

  const rows = table.rows.map(row => {
    const next = [...row];
    for (const column of valueColumns) {
      const raw = row[column.index] ?? '';
      if (raw.trim() === '') continue;

      const result = coerce(column.coercion, raw);
      const report = reports.get(column.index)!;

      if (result.ok) {
        next[column.index] = result.value;
        report.converted++;
      } else {
        next[column.index] = '';
        if (result.reason === 'placeholder') {
          report.placeholder++;
        } else {
          report.unconvertible++;
          if (report.examples.length < 3 && !report.examples.includes(raw)) report.examples.push(raw);
        }
      }
    }
    return next;
  });

  return { rows, reports };
}

/** colIdx → propertyId, including the name column, which the engine expects mapped. */
export function buildColumnMapping(mapping: ImportMapping): Record<number, string> {
  const columnMapping: Record<number, string> = { [mapping.nameColumn]: SystemIds.NAME_PROPERTY };
  for (const column of mapping.columns) {
    if (column.kind === 'skip') continue;
    columnMapping[column.index] = column.propertyId;
  }
  return columnMapping;
}

/**
 * Apply the model's relation types only where the ontology stayed silent.
 *
 * `collectRelationCells` reads `typeIds` off the property, which the API returns
 * empty for every property; `hydrateRelationValueTypes` fills most of them back
 * in. Whatever survives that is the ontology's own answer and is never
 * overridden — the model's reading is a fallback for the properties nobody
 * declared, and nothing more.
 */
export function fillMissingRelationTypes(
  relationProperties: Array<{ propertyId: string; typeIds: string[] }>,
  mapping: ImportMapping
): { filled: number } {
  const byProperty = new Map(
    mapping.columns
      .filter((c): c is MappedRelationColumn => c.kind === 'relation')
      .map(c => [c.propertyId, c.relationTypeIds])
  );

  let filled = 0;
  for (const relationProperty of relationProperties) {
    if (relationProperty.typeIds.length > 0) continue;
    const fromModel = byProperty.get(relationProperty.propertyId);
    if (fromModel && fromModel.length > 0) {
      relationProperty.typeIds = [...fromModel];
      filled++;
    }
  }

  return { filled };
}

/**
 * The per-column split rules, in the shape the generation engine wants.
 *
 * Built once and handed to every function that splits a cell. They have to
 * agree: resolution is keyed on `propertyId::name`, so collecting names under
 * one rule and reading them back under another misses every lookup and the
 * whole column comes out unresolved.
 */
export function buildSplitRules(mapping: ImportMapping): RelationSplitRules {
  const rules: RelationSplitRules = {};

  for (const column of mapping.columns) {
    if (column.kind !== 'relation' || !column.split) continue;
    rules[column.index] = column.split;
  }

  return rules;
}

async function loadProperties(ids: string[]): Promise<Record<string, Property>> {
  if (ids.length === 0) return {};

  let properties: Property[] = [];
  try {
    properties = (await Effect.runPromise(getProperties(ids))) ?? [];
  } catch (err) {
    console.error('[chat/import-apply] property fetch failed', err);
    return {};
  }

  // Relations first: their value types are what the resolver filters on, and
  // the API never sends them.
  const hydrated = await Promise.all(
    properties.map(async property => {
      if (property.dataType !== 'RELATION') return property;
      try {
        return await hydrateRelationValueTypes(property);
      } catch {
        return property;
      }
    })
  );

  return Object.fromEntries(hydrated.map(p => [p.id, p]));
}

function yieldToMain(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

export type ApplyDeps = {
  /** Local relations for an entity, so we don't restate one that already exists. */
  getResolvedRelations: (entityId: string) => Relation[];
  /** Locally-known property, preferred over the network copy. */
  getStoreProperty: (propertyId: string) => Property | null;
};

export async function applyImportToStore(params: {
  session: ImportSession;
  mapping: ImportMapping;
  spaceId: string;
  guard: Guard;
  deps: ApplyDeps;
  onProgress?: (progress: ApplyProgress) => void;
}): Promise<ApplyResult> {
  const { session, mapping, spaceId, guard, deps, onProgress } = params;
  const report = (stage: ApplyProgress['stage'], message: string) => onProgress?.({ stage, message });

  // A name column is the one thing an import cannot do without: it is what
  // rows are matched on and what every created entity is called. Everything
  // else being skipped is still a valid import — N entities of one type, named.
  const mapped = mapping.columns.filter(c => c.kind !== 'skip');
  if (!session.table.headers[mapping.nameColumn]) return { ok: false, error: 'no_name_column' };

  try {
    report('preparing', 'Reading the space ontology…');
    const propertyIds = [...new Set(mapped.map(c => c.propertyId))];
    const extraProperties = await loadProperties(propertyIds);
    if (!guard.isCurrent()) return { ok: false, error: 'aborted' };

    const propertyLookup = {
      schema: [] as Property[],
      extraProperties,
      getProperty: deps.getStoreProperty,
    };

    report('converting', 'Converting values…');
    const { rows: dataRows, reports } = coerceTable(session.table, mapping);
    await yieldToMain();
    if (!guard.isCurrent()) return { ok: false, error: 'aborted' };

    const columnMapping = buildColumnMapping(mapping);
    const splitRules = buildSplitRules(mapping);

    report('linking', 'Matching linked entities…');
    const relationProperties = collectRelationCells({ columnMapping, dataRows, propertyLookup, splitRules });
    // The fix: give the resolver the types it has always accepted and never
    // been given. Without this its filter is skipped and it ranks by
    // popularity instead.
    fillMissingRelationTypes(relationProperties, mapping);

    const relationResolution = await resolveRelationEntities({ relationProperties, guard });
    if (relationResolution.aborted || !guard.isCurrent()) return { ok: false, error: 'aborted' };

    report('matching', 'Matching rows to existing entities…');
    const selectedType = { id: mapping.typeId, name: mapping.typeName };
    const rowResolution = await resolveRowsByNameAndType({
      dataRows,
      nameColIdx: mapping.nameColumn,
      selectedType,
      typesColumnIndex: undefined,
      resolvedTypes: new Map(),
      guard,
    });
    if (rowResolution.aborted || !guard.isCurrent()) return { ok: false, error: 'aborted' };

    report('building', 'Building the edits…');
    const plan = buildImportPlan({
      dataRows,
      columnMapping,
      nameColIdx: mapping.nameColumn,
      selectedType,
      typesColumnIndex: undefined,
      resolvedEntities: relationResolution.resolvedEntities,
      resolvedTypes: new Map(),
      resolvedRows: rowResolution.resolvedRows,
      spaceId,
      propertyLookup,
      getExistingRelations: deps.getResolvedRelations,
      splitRules,
    });
    if (!guard.isCurrent()) return { ok: false, error: 'aborted' };

    report('staging', `Staging ${plan.values.length + plan.relations.length} edits…`);
    await writeToStore(plan.values, plan.relations, guard);
    if (!guard.isCurrent()) return { ok: false, error: 'aborted' };

    const columns: ColumnOutcome[] = [];
    for (const [index, columnReport] of reports) {
      const column = mapping.columns.find(c => c.index === index);
      columns.push({
        index,
        header: session.table.headers[index] ?? `Column ${index + 1}`,
        propertyName: column && column.kind !== 'skip' ? column.propertyName : '',
        report: columnReport,
      });
    }

    const firstValue = plan.values[0];

    return {
      ok: true,
      entityCount: rowResolution.resolvedRows.size,
      editCount: plan.values.length + plan.relations.length,
      ambiguousRows: rowResolution.unresolvedRowCount,
      unresolvedRelations: relationResolution.unresolvedCount,
      columns,
      typeName: mapping.typeName,
      probe: firstValue ? { valueId: firstValue.id, entityId: firstValue.entity.id } : null,
    };
  } catch (err) {
    console.error('[chat/import-apply] failed', err);
    return { ok: false, error: 'apply_failed' };
  }
}

/** How many edits to write before handing the thread back to the browser. */
const STAGE_CHUNK = 250;

/**
 * Write the plan into the local store in chunks.
 *
 * A large import is tens of thousands of `set` calls, each notifying
 * subscribers. Writing them in one synchronous run locks the tab for the
 * duration; chunking keeps the progress indicator moving and the stop button
 * live.
 */
async function writeToStore(values: Value[], relations: Relation[], guard: Guard): Promise<void> {
  for (let i = 0; i < values.length; i++) {
    storage.values.set(values[i]);
    if ((i + 1) % STAGE_CHUNK === 0) {
      await yieldToMain();
      if (!guard.isCurrent()) return;
    }
  }

  for (let i = 0; i < relations.length; i++) {
    storage.relations.set(relations[i]);
    if ((i + 1) % STAGE_CHUNK === 0) {
      await yieldToMain();
      if (!guard.isCurrent()) return;
    }
  }
}
