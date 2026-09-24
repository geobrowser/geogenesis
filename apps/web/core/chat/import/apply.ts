'use client';

/**
 * Validate and prepare an entire workbook before staging any edits. Row identities
 * are shared by name and type across sheets; existing import resolvers and plan
 * builders still own graph matching and edit generation.
 */
import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { Effect } from 'effect';

import { getProperties } from '~/core/io/queries';
import { storage } from '~/core/sync/use-mutate';
import type { Property, Relation, Value } from '~/core/types';

import {
  type RelationPropertyMeta,
  type RelationSplitRules,
  type ResolvedEntity,
  buildImportPlan,
  collectRelationCells,
  hydrateRelationValueTypes,
} from '~/partials/import/import-generation';
import { resolveRelationEntities, resolveRowsByNameAndType } from '~/partials/import/import-resolution';

import { type ColumnCoercionReport, coerce } from './coerce';
import type { ImportMapping, MappedRelationColumn, MappedValueColumn } from './mapping-types';
import { validateMappingProperties } from './mapping-validation';
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
      /** Distinct primary row entities created or updated by this import. */
      entityCount: number;
      linkedEntityCount: number;
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
      /** Every row's entity, so a later tab of the same file can link to it by name. */
      rows: KnownEntity[];
      /** Newly staged relation edges to row entities in another workbook tab. */
      crossSheetLinks: number;
    }
  | {
      ok: false;
      error: 'aborted' | 'no_name_column' | 'apply_failed' | 'invalid_mapping' | 'invalid_values';
      message?: string;
    };

/** Matches the shape the resolution functions expect without importing their private type. */
type Guard = { isCurrent: () => boolean };

export type KnownEntity = { id: string; name: string; typeIds?: string[] };
export type KnownEntities = ReadonlyMap<string, KnownEntity | KnownEntity[]>;

/**
 * Link relation cells to rows of tabs already imported from the same file.
 *
 * A workbook with a Countries tab and a Publishers tab whose Country column
 * names those countries means the rows, not whatever the graph search would
 * turn up — and for a name the graph has never seen, the search would mint a
 * second entity. Seeded before resolution, and taken out of the resolver's
 * work, so each name is answered exactly once.
 */
export function preResolveKnown(
  relationProperties: RelationPropertyMeta[],
  known: KnownEntities
): { seeded: Map<string, ResolvedEntity>; links: number } {
  const seeded = new Map<string, ResolvedEntity>();
  let links = 0;
  if (known.size === 0) return { seeded, links };

  for (const relationProperty of relationProperties) {
    for (const value of [...relationProperty.uniqueCellValues]) {
      const entry = known.get(value.trim().toLowerCase());
      if (!entry) continue;
      const matches = (Array.isArray(entry) ? entry : [entry]).filter(
        entity =>
          relationProperty.typeIds.length === 0 || entity.typeIds?.some(type => relationProperty.typeIds.includes(type))
      );
      const distinct = [...new Map(matches.map(entity => [entity.id, entity])).values()];
      if (distinct.length === 0) continue;
      if (distinct.length > 1) {
        seeded.set(`${relationProperty.propertyId}::${value}`, { status: 'ambiguous' });
        relationProperty.uniqueCellValues.delete(value);
        continue;
      }
      const match = distinct[0];
      seeded.set(`${relationProperty.propertyId}::${value}`, { id: match.id, name: match.name, status: 'found' });
      relationProperty.uniqueCellValues.delete(value);
      links++;
    }
  }

  return { seeded, links };
}

/** Whether the mapping names a column the table actually has. */
export function hasNameColumn(table: ParsedTable, mapping: ImportMapping): boolean {
  return Number.isInteger(mapping.nameColumn) && mapping.nameColumn >= 0 && mapping.nameColumn < table.headers.length;
}

/** Convert value columns and report invalid cells; preparation rejects them before staging. */
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

type ImportInput = { table: ParsedTable; mapping: ImportMapping };
type RowResolution = Awaited<ReturnType<typeof resolveRowsByNameAndType>>;
type ApplySuccess = Extract<ApplyResult, { ok: true }>;
type ApplyFailure = Extract<ApplyResult, { ok: false }>;
export type PreparedWorkbook =
  | { ok: true; values: Value[]; relations: Relation[]; results: ApplySuccess[] }
  | (ApplyFailure & { sheetIndex?: number });

/** Resolve every row before any links or writes, including forward references and cycles. */
export async function prepareWorkbook(params: {
  sheets: ImportInput[];
  spaceId: string;
  guard: Guard;
  deps: ApplyDeps;
  knownEntities?: KnownEntities;
  onProgress?: (progress: ApplyProgress) => void;
}): Promise<PreparedWorkbook> {
  const { sheets, spaceId, guard, deps, onProgress } = params;
  const report = (stage: ApplyProgress['stage'], message: string) => onProgress?.({ stage, message });
  try {
    for (let i = 0; i < sheets.length; i++) {
      if (!hasNameColumn(sheets[i].table, sheets[i].mapping)) {
        return { ok: false, error: 'no_name_column', sheetIndex: i };
      }
    }
    if (!guard.isCurrent()) return { ok: false, error: 'aborted' };
    report('preparing', 'Checking the mapped properties…');
    const propertyIds = [
      ...new Set(sheets.flatMap(s => s.mapping.columns.flatMap(c => (c.kind === 'skip' ? [] : [c.propertyId])))),
    ];
    const extraProperties = await loadProperties(propertyIds);
    // Local schema edits (including changed data types) are authoritative.
    for (const id of propertyIds) {
      const local = deps.getStoreProperty(id);
      if (local)
        extraProperties[id] = {
          ...extraProperties[id],
          ...local,
          relationValueTypes: local.relationValueTypes?.length
            ? local.relationValueTypes
            : (extraProperties[id]?.relationValueTypes ?? []),
        };
    }
    const propertyLookup = { schema: [] as Property[], extraProperties, getProperty: deps.getStoreProperty };
    for (let i = 0; i < sheets.length; i++) {
      const { table, mapping } = sheets[i];
      const indices = new Set<number>();
      if (
        mapping.columns.some(
          c =>
            !Number.isInteger(c.index) ||
            c.index < 0 ||
            c.index >= table.headers.length ||
            c.index === mapping.nameColumn ||
            indices.has(c.index) ||
            !indices.add(c.index)
        )
      ) {
        return {
          ok: false,
          error: 'invalid_mapping',
          sheetIndex: i,
          message: 'The mapping has invalid or duplicate columns. Preview it again.',
        };
      }
      const message = validateMappingProperties(mapping, id => extraProperties[id]);
      if (message) return { ok: false, error: 'invalid_mapping', message, sheetIndex: i };
    }
    if (!guard.isCurrent()) return { ok: false, error: 'aborted' };

    report('matching', 'Matching rows across the workbook…');
    const flatRows = sheets.flatMap(({ table, mapping }) =>
      table.rows.map(row => [row[mapping.nameColumn] ?? '', mapping.typeId])
    );
    const resolution = await resolveRowsByNameAndType({
      dataRows: flatRows,
      nameColIdx: 0,
      selectedType: null,
      typesColumnIndex: 1,
      resolvedTypes: new Map(sheets.map(s => [s.mapping.typeId, { id: s.mapping.typeId, name: s.mapping.typeName }])),
      guard,
    });
    if (resolution.aborted || !guard.isCurrent()) return { ok: false, error: 'aborted' };
    const known = new Map<string, KnownEntity[]>();
    for (const [name, entry] of params.knownEntities ?? [])
      known.set(name, Array.isArray(entry) ? [...entry] : [entry]);
    for (const [index, row] of resolution.resolvedRows) {
      const key = row.name.trim().toLowerCase();
      const entries = known.get(key) ?? [];
      const typeId = flatRows[index][1];
      const matches = [...new Map(entries.filter(e => e.typeIds?.includes(typeId)).map(e => [e.id, e])).values()];
      if (matches.length > 1)
        return {
          ok: false,
          error: 'invalid_values',
          message: `Several pending entities named ${row.name} have the same type. Resolve those duplicates before importing.`,
        };
      const existing = matches[0];
      if (existing) resolution.resolvedRows.set(index, { entityId: existing.id, name: row.name });
      else entries.push({ id: row.entityId, name: row.name, typeIds: [typeId] });
      known.set(key, entries);
    }

    const values = new Map<string, Value>();
    const relations = new Map<string, Relation>();
    const results: ApplySuccess[] = [];
    let offset = 0;
    for (let i = 0; i < sheets.length; i++) {
      const { table, mapping } = sheets[i];
      report('converting', 'Checking column values…');
      const { rows: dataRows, reports } = coerceTable(table, mapping);
      const invalid = [...reports].filter(([, r]) => r.unconvertible > 0);
      if (invalid.length)
        return {
          ok: false,
          error: 'invalid_values',
          sheetIndex: i,
          message:
            invalid
              .map(
                ([index, r]) =>
                  `${table.headers[index]}: ${r.unconvertible} values cannot be converted (examples: ${r.examples.join(', ')}).`
              )
              .join(' ') + ' Correct these cells or change the mapping before importing.',
        };
      await yieldToMain();
      if (!guard.isCurrent()) return { ok: false, error: 'aborted' };
      const columnMapping = buildColumnMapping(mapping);
      const splitRules = buildSplitRules(mapping);
      const relationProperties = collectRelationCells({ columnMapping, dataRows, propertyLookup, splitRules });
      fillMissingRelationTypes(relationProperties, mapping);
      // The plan's within-sheet cross-reference must use the same type constraints as resolution.
      for (const relation of relationProperties) {
        extraProperties[relation.propertyId] = {
          ...extraProperties[relation.propertyId],
          relationValueTypes: relation.typeIds.map(id => ({ id, name: null })),
        };
      }
      const { seeded } = preResolveKnown(relationProperties, known);
      report('linking', 'Matching linked entities…');
      const linked = await resolveRelationEntities({ relationProperties, guard });
      if (linked.aborted || !guard.isCurrent()) return { ok: false, error: 'aborted' };
      for (const [key, entity] of seeded) linked.resolvedEntities.set(key, entity);
      const resolvedRows: RowResolution['resolvedRows'] = new Map();
      const otherSheetRows = new Set(
        [...resolution.resolvedRows]
          .filter(([index]) => index < offset || index >= offset + dataRows.length)
          .map(([, row]) => row.entityId)
      );
      for (let row = 0; row < dataRows.length; row++) {
        const match = resolution.resolvedRows.get(offset + row);
        if (match) resolvedRows.set(row, match);
      }
      offset += dataRows.length;
      report('building', 'Preparing the workbook edits…');
      const plan = buildImportPlan({
        dataRows,
        columnMapping,
        nameColIdx: mapping.nameColumn,
        selectedType: { id: mapping.typeId, name: mapping.typeName },
        typesColumnIndex: undefined,
        resolvedEntities: linked.resolvedEntities,
        resolvedTypes: new Map(),
        resolvedRows,
        spaceId,
        propertyLookup,
        getExistingRelations: id => [
          ...deps.getResolvedRelations(id).filter(relation => relation.spaceId === spaceId && !relation.isDeleted),
          ...[...relations.values()].filter(r => r.fromEntity.id === id),
        ],
        splitRules,
      });
      for (const entity of plan.resolvedEntitiesSnapshot.values()) {
        if (entity.status !== 'created' || !entity.typeId) continue;
        const key = entity.name.trim().toLowerCase();
        const entries = known.get(key) ?? [];
        if (!entries.some(entry => entry.id === entity.id))
          entries.push({ id: entity.id, name: entity.name, typeIds: [entity.typeId] });
        known.set(key, entries);
      }
      let edits = 0;
      let crossSheetLinks = 0;
      const sheetRowIds = new Set([...resolvedRows.values()].map(row => row.entityId));
      const relationPropertyIds = new Set(
        mapping.columns.flatMap(column => (column.kind === 'relation' ? [column.propertyId] : []))
      );
      for (const value of plan.values) {
        const previous = values.get(value.id);
        if (
          previous &&
          previous.value !== value.value &&
          !(value.property.id === SystemIds.NAME_PROPERTY && previous.value.toLowerCase() === value.value.toLowerCase())
        ) {
          return {
            ok: false,
            error: 'invalid_values',
            sheetIndex: i,
            message: `Rows for ${value.entity.name ?? value.entity.id} contain conflicting values for ${value.property.name ?? value.property.id}. Give distinct entities distinct names, or combine the rows before importing.`,
          };
        }
        if (!previous) {
          values.set(value.id, value);
          edits++;
        }
      }
      for (const relation of plan.relations) {
        const key = `${relation.spaceId}:${relation.fromEntity.id}:${relation.type.id}:${relation.toEntity.id}`;
        if (!relations.has(key)) {
          relations.set(key, relation);
          edits++;
          if (
            sheetRowIds.has(relation.fromEntity.id) &&
            relationPropertyIds.has(relation.type.id) &&
            otherSheetRows.has(relation.toEntity.id)
          )
            crossSheetLinks++;
        }
      }
      const columns = [...reports].map(([index, columnReport]) => {
        const column = mapping.columns.find(c => c.index === index);
        return {
          index,
          header: table.headers[index],
          propertyName: column && column.kind !== 'skip' ? column.propertyName : '',
          report: columnReport,
        };
      });
      const rows = [...resolvedRows.values()].map(row => ({
        id: row.entityId,
        name: row.name,
        typeIds: [mapping.typeId],
      }));
      const first = plan.values[0];
      results.push({
        ok: true,
        entityCount: new Set(rows.map(row => row.id)).size,
        linkedEntityCount: new Set(
          plan.values
            .filter(
              value => value.property.id === SystemIds.NAME_PROPERTY && !rows.some(row => row.id === value.entity.id)
            )
            .map(value => value.entity.id)
        ).size,
        editCount: edits,
        ambiguousRows: dataRows.length - resolvedRows.size,
        unresolvedRelations: linked.unresolvedCount + [...seeded.values()].filter(e => e.status === 'ambiguous').length,
        columns,
        typeName: mapping.typeName,
        probe: first ? { valueId: first.id, entityId: first.entity.id } : null,
        rows,
        crossSheetLinks,
      });
    }
    if (!guard.isCurrent()) return { ok: false, error: 'aborted' };
    return { ok: true, values: [...values.values()], relations: [...relations.values()], results };
  } catch (err) {
    console.error('[chat/import-apply] preparation failed', err);
    return { ok: false, error: 'apply_failed' };
  }
}

/** No awaits during commit: cancellation or a failed later sheet cannot leave a partial workbook. */
export function commitWorkbook(plan: Extract<PreparedWorkbook, { ok: true }>, guard: Guard): boolean {
  if (!guard.isCurrent()) return false;
  storage.values.setMany(plan.values);
  storage.relations.setMany(plan.relations);
  return true;
}

export async function applyImportToStore(params: {
  table: ParsedTable;
  mapping: ImportMapping;
  spaceId: string;
  guard: Guard;
  deps: ApplyDeps;
  knownEntities?: KnownEntities;
  onProgress?: (progress: ApplyProgress) => void;
}): Promise<ApplyResult> {
  const plan = await prepareWorkbook({ ...params, sheets: [{ table: params.table, mapping: params.mapping }] });
  if (!plan.ok) return plan;
  if (!commitWorkbook(plan, params.guard)) return { ok: false, error: 'aborted' };
  return plan.results[0];
}
