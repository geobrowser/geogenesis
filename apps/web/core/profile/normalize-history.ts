import {
  ACADEMIC_FIELDS_PROPERTY,
  DEGREE_PROPERTY,
  DESCRIPTION_PROPERTY,
  EDUCATION_STATUS_PROPERTY,
  EMPLOYMENT_STATUS_PROPERTY,
  EMPLOYMENT_TYPE_PROPERTY,
  END_DATE_PROPERTY,
  type EducationStatus,
  type EmploymentStatus,
  LEGACY_FIELD_OF_STUDY_PROPERTY,
  ROLES_PROPERTY,
  SKILLS_PROPERTY,
  START_DATE_PROPERTY,
  educationStatusFromOptionId,
  employmentStatusFromOptionId,
} from './history-ontology';

/** Shapes as they come back from the graph; see `fetch-profile-history.ts`. */
export type HistoryValueNode = { property: { id: string }; date: string | null; text: string | null };
export type HistoryRelationNode = {
  id: string;
  entityId: string;
  type: { id: string };
  toEntity: { id: string; name: string | null } | null;
  entity: { valuesList: HistoryValueNode[]; relationsList: HistoryRelationNode[] } | null;
};
export type HistoryEdgeNode = {
  id: string;
  entityId: string;
  toEntity: {
    id: string;
    name: string | null;
    relationsList?: { toEntity: { valuesList: HistoryValueNode[] } | null }[];
  } | null;
  entity: { valuesList: HistoryValueNode[]; relationsList: HistoryRelationNode[] } | null;
};

export type NamedRef = { id: string; name: string | null };

/** One dated row under an organisation — a role held, or a degree read. */
export type HistoryEntry = {
  /** The Roles/Degree relation, which is what removing this row deletes. */
  relationId: string;
  /** That relation's own entity, which carries the dates and status. */
  tenureId: string;
  subject: NamedRef;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
  /**
   * True when the dates came off the stint rather than this row's own tenure —
   * the pre-GEO-2858 shape. Rendering treats them the same; editing must not,
   * since writing to the tenure would leave the stint's copy behind.
   */
  isLegacy: boolean;
};

export type EmploymentEntry = HistoryEntry & {
  status: EmploymentStatus | null;
  employmentType: NamedRef | null;
  skills: NamedRef[];
};
export type EducationEntry = HistoryEntry & { status: EducationStatus | null; fields: NamedRef[] };

/** An organisation and everything held there. One card in the resting state. */
export type HistoryCard<TEntry> = {
  /** The Employment/Education relation — removing this drops the whole card. */
  relationId: string;
  /** Its entity, which every row hangs off. */
  stintId: string;
  organization: NamedRef;
  /** The organisation's own avatar, where it has one. */
  avatarUrl?: string | null;
  entries: TEntry[];
};

export type EmploymentCard = HistoryCard<EmploymentEntry>;
export type EducationCard = HistoryCard<EducationEntry>;

function valueFor(values: HistoryValueNode[], propertyId: string) {
  return values.find(value => value.property.id === propertyId);
}

function dateFor(values: HistoryValueNode[], propertyId: string) {
  return valueFor(values, propertyId)?.date ?? null;
}

function textFor(values: HistoryValueNode[], propertyId: string) {
  const text = valueFor(values, propertyId)?.text;
  return text && text.trim() !== '' ? text : null;
}

function relationTo(relations: HistoryRelationNode[], propertyId: string) {
  return relations.find(relation => relation.type.id === propertyId)?.toEntity ?? null;
}

/**
 * Reads one dated row, preferring its own tenure and falling back to the stint.
 *
 * Nineteen records written before this shape existed put the dates, status and
 * description on the stint instead. Without the fallback they render as a company
 * and a job title with no dates at all — so the fallback stays until they are
 * migrated, and `isLegacy` marks the ones still relying on it.
 */
function readEntry(
  relation: HistoryRelationNode,
  stintValues: HistoryValueNode[],
  stintRelations: HistoryRelationNode[],
  statusProperty: string
) {
  const tenureValues = relation.entity?.valuesList ?? [];
  const tenureRelations = relation.entity?.relationsList ?? [];

  const ownStart = dateFor(tenureValues, START_DATE_PROPERTY);
  const ownEnd = dateFor(tenureValues, END_DATE_PROPERTY);
  const ownStatus = relationTo(tenureRelations, statusProperty);
  const ownDescription = textFor(tenureValues, DESCRIPTION_PROPERTY);

  // A tenure that carries nothing at all is the legacy case. Judged on the whole
  // row rather than field by field, so a row with a real start and a deliberately
  // empty end is not mistaken for one.
  const isLegacy = ownStart === null && ownEnd === null && ownStatus === null && ownDescription === null;

  return {
    relationId: relation.id,
    tenureId: relation.entityId,
    subject: relation.toEntity ?? { id: relation.entityId, name: null },
    startDate: isLegacy ? dateFor(stintValues, START_DATE_PROPERTY) : ownStart,
    endDate: isLegacy ? dateFor(stintValues, END_DATE_PROPERTY) : ownEnd,
    description: isLegacy ? textFor(stintValues, DESCRIPTION_PROPERTY) : ownDescription,
    statusOptionId: (isLegacy ? relationTo(stintRelations, statusProperty) : ownStatus)?.id ?? null,
    isLegacy,
  };
}

/** The image entity's URL, which is whichever of its values looks like one. */
function readAvatar(edge: HistoryEdgeNode): string | null {
  for (const relation of edge.toEntity?.relationsList ?? []) {
    const url = relation.toEntity?.valuesList.find(value => typeof value.text === 'string' && value.text !== '');
    if (url?.text) return url.text;
  }
  return null;
}

function readCard<TEntry>(
  edge: HistoryEdgeNode,
  readEntries: (stintValues: HistoryValueNode[], stintRelations: HistoryRelationNode[]) => TEntry[]
): HistoryCard<TEntry> {
  const stintValues = edge.entity?.valuesList ?? [];
  const stintRelations = edge.entity?.relationsList ?? [];

  return {
    relationId: edge.id,
    stintId: edge.entityId,
    organization: edge.toEntity ?? { id: edge.entityId, name: null },
    avatarUrl: readAvatar(edge),
    entries: readEntries(stintValues, stintRelations),
  };
}

export function normalizeEmployment(edges: HistoryEdgeNode[]): EmploymentCard[] {
  return edges.map(edge =>
    readCard<EmploymentEntry>(edge, (stintValues, stintRelations) =>
      stintRelations
        .filter(relation => relation.type.id === ROLES_PROPERTY)
        .map(relation => {
          const { statusOptionId, ...entry } = readEntry(
            relation,
            stintValues,
            stintRelations,
            EMPLOYMENT_STATUS_PROPERTY
          );
          const tenureRelations = relation.entity?.relationsList ?? [];

          return {
            ...entry,
            status: employmentStatusFromOptionId(statusOptionId),
            employmentType: relationTo(tenureRelations, EMPLOYMENT_TYPE_PROPERTY),
            skills: tenureRelations
              .filter(skill => skill.type.id === SKILLS_PROPERTY)
              .map(skill => skill.toEntity)
              .filter((skill): skill is NamedRef => skill !== null),
          };
        })
        .sort(byMostRecent)
    )
  );
}

export function normalizeEducation(edges: HistoryEdgeNode[]): EducationCard[] {
  return edges.map(edge =>
    readCard<EducationEntry>(edge, (stintValues, stintRelations) =>
      stintRelations
        .filter(relation => relation.type.id === DEGREE_PROPERTY)
        .map(relation => {
          const { statusOptionId, ...entry } = readEntry(
            relation,
            stintValues,
            stintRelations,
            EDUCATION_STATUS_PROPERTY
          );

          const enrolmentRelations = relation.entity?.relationsList ?? [];
          const fields = enrolmentRelations
            .filter(field => field.type.id === ACADEMIC_FIELDS_PROPERTY)
            .map(field => field.toEntity)
            .filter((field): field is NamedRef => field !== null);

          // Eleven records predate `Academic fields` and keep the discipline as
          // text on the stint. Shown, never written — they are the seed for real
          // Academic field entities rather than a second way to store one.
          const legacyField = textFor(stintValues, LEGACY_FIELD_OF_STUDY_PROPERTY);

          return {
            ...entry,
            status: educationStatusFromOptionId(statusOptionId),
            fields: fields.length > 0 || legacyField === null ? fields : [{ id: '', name: legacyField }],
          };
        })
        .sort(byMostRecent)
    )
  );
}

/**
 * Most recent first, and anything still open ahead of anything ended. A row with
 * no dates at all sorts last rather than jumping the list on an empty string.
 */
function byMostRecent(a: HistoryEntry, b: HistoryEntry) {
  const aOpen = a.startDate !== null && a.endDate === null;
  const bOpen = b.startDate !== null && b.endDate === null;
  if (aOpen !== bOpen) return aOpen ? -1 : 1;

  const aKey = a.endDate ?? a.startDate;
  const bKey = b.endDate ?? b.startDate;
  if (aKey === bKey) return 0;
  if (aKey === null) return 1;
  if (bKey === null) return -1;
  return bKey.localeCompare(aKey);
}
