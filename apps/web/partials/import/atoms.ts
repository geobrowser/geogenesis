import { atom } from 'jotai';

import { Property, Relation, Value } from '~/core/types';

export const loadingAtom = atom<boolean>(false);

export type ImportStep = 'step1' | 'step2' | 'step3' | 'step4' | 'step5' | 'done';

export const stepAtom = atom<ImportStep>('step1');

/** Unique import session identifier. Generated on file upload, cleared on reset. */
export const importSessionIdAtom = atom<string | null>(null);

/**
 * Incremented on every set/clear of the session store.
 * Drives useMemo cache invalidation in useImportData so that a new file
 * with the same row count still triggers a re-read.
 */
export const importRevisionAtom = atom<number>(0);

/** Name of the uploaded CSV file */
export const fileNameAtom = atom<string | undefined>(undefined);

/** Type entity selected for all rows (when CSV has no Types column). id and name. */
export const selectedTypeAtom = atom<{ id: string; name: string | null } | null>(null);

/** If CSV has a "Types" column, its 0-based index; otherwise undefined */
export const typesColumnIndexAtom = atom<number | undefined>(undefined);

/** Column index -> property id. Must include one column mapped to NAME_PROPERTY. */
export const columnMappingAtom = atom<Record<number, string>>({});

/** Properties selected/created during mapping that aren't in the type's schema. */
export const extraPropertiesAtom = atom<Record<string, Property>>({});

/**
 * CSV headers (first row).
 * UI snapshot — canonical source is ImportSessionStore.
 */
export const headersAtom = atom<string[]>([]);

/**
 * Number of non-empty data rows (excluding header).
 * UI snapshot — canonical source is ImportSessionStore.
 */
export const rowCountAtom = atom<number>(0);

/** Formatted entity count for display. */
export const entityCountAtom = atom(get => {
  const count = get(rowCountAtom);
  return count.toLocaleString('en-US', { style: 'decimal' });
});

export const valuesAtom = atom<Array<Value>>([]);

/** Generated relations (e.g. Types) for the import. Passed to makeBulkProposal with values. */
export const relationsAtom = atom<Relation[]>([]);

export type UnresolvedImportCell =
  | { kind: 'entity' }
  | { kind: 'type'; rawType: string }
  | { kind: 'relation'; unresolvedValues: string[] }
  | { kind: 'checkbox'; rawValue: string }
  | { kind: 'image-invalid'; rawValue: string }
  | { kind: 'image-error'; rawValue: string; error: string };

/** Per-cell unresolved link metadata keyed as `${rowIndex}:${csvColumnIndex}`. */
export const unresolvedLinksAtom = atom<Record<string, UnresolvedImportCell>>({});

export type RelationResolutionOverride = {
  id: string;
  name: string;
  status: 'found' | 'created';
  typeId?: string;
  typeName?: string | null;
};

/** Manual relation token resolution keyed by `${propertyId}::${token}`. */
export const relationOverridesAtom = atom<Record<string, RelationResolutionOverride>>({});

export type TypeResolutionOverride = { id: string; name: string; isNew?: boolean };

/** Manual type resolution keyed by raw CSV type value. */
export const typeOverridesAtom = atom<Record<string, TypeResolutionOverride>>({});

/** Manual checkbox value overrides keyed by `${rowIndex}:${csvColumnIndex}`. */
export const checkboxOverridesAtom = atom<Record<string, string>>({});

/** Manual row-entity resolution keyed by row index. Overrides auto-resolved or unresolved rows. */
export const rowOverridesAtom = atom<Record<number, { entityId: string; name: string }>>({});

/** Snapshot of merged resolved rows after generation, keyed by row index. */
export const resolvedRowsSnapshotAtom = atom<Map<number, { entityId: string; name: string }>>(new Map());

/** Snapshot of merged resolved types after generation, keyed by raw CSV type string. */
export const resolvedTypesSnapshotAtom = atom<Map<string, { id: string; name: string; isNew?: boolean }>>(new Map());

/** Snapshot of merged resolved relation entities after generation, keyed by `${propertyId}::${token}`. */
export const resolvedEntitiesSnapshotAtom = atom<
  Map<string, { id: string; name: string; status: string; typeId?: string; typeName?: string | null }>
>(new Map());

export const actionsCountAtom = atom(get => {
  const values = get(valuesAtom);
  const relations = get(relationsAtom);
  return (values.length + relations.length).toLocaleString('en-US', { style: 'decimal' });
});

export type ImageImportTask = {
  /** Data row index (0-based, relative to dataRows not records) */
  rowIndex: number;
  /** CSV column index */
  colIdx: number;
  /** The image property ID this column is mapped to */
  propertyId: string;
  /** The image property name */
  propertyName: string;
  /** The entity ID for the row this image belongs to */
  fromEntityId: string;
  /** The entity name for the row */
  fromEntityName: string;
  /** The external URL pointing to the hosted image */
  url: string;
};

/** Image upload tasks collected during generation. */
export const imageTasksAtom = atom<ImageImportTask[]>([]);

/**
 * Cached per-cell image entity data so rebuild can re-merge without re-uploading.
 * Keyed by `${rowIndex}:${colIdx}`. Stores the image entity's own values and internal
 * relations (e.g. Types → IMAGE_TYPE), plus the image entity ID and property info
 * needed to regenerate the linking relation from the current resolved row.
 */
export type ImageEntityData = {
  /** The uploaded image entity ID (hex) */
  imageEntityId: string;
  /** The image property ID this cell maps to */
  propertyId: string;
  /** The image property name */
  propertyName: string;
  /** Values belonging to the image entity (IMAGE_URL_PROPERTY, width, height) */
  values: Value[];
  /** Internal relations of the image entity (e.g. Types → IMAGE_TYPE) */
  relations: Relation[];
};

export const imageEntityCacheAtom = atom<Record<string, ImageEntityData>>({});

export const publishAtom = atom<boolean>(false);
