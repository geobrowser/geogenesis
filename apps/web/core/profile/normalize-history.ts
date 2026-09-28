import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { findMediaUrlValue } from '~/core/utils/media-url';

import {
  DEGREE_INFORMATION_TYPE,
  DEGREE_PROPERTY,
  DESCRIPTION_PROPERTY,
  EDUCATION_STATUS_PROPERTY,
  EMPLOYMENT_STATUS_PROPERTY,
  EMPLOYMENT_TYPE_PROPERTY,
  END_DATE_PROPERTY,
  type EducationStatus,
  type EmploymentStatus,
  FIELDS_OF_STUDY_PROPERTY,
  GRADE_PROPERTY,
  LEGACY_FIELD_OF_STUDY_PROPERTY,
  LOCATION_PROPERTY,
  LOCATION_TYPE_PROPERTY,
  ROLES_PROPERTY,
  ROLE_INFORMATION_TYPE,
  SKILLS_PROPERTY,
  START_DATE_PROPERTY,
  educationStatusFromOptionId,
  employmentStatusFromOptionId,
} from './history-ontology';

/** Shapes as they come back from the graph; see `fetch-profile-history.ts`. */
export type HistoryValueNode = {
  id?: string;
  spaceId?: string;
  property: { id: string };
  date: string | null;
  text: string | null;
  decimal?: string | null;
};
export type HistoryRelationNode = {
  id: string;
  entityId: string;
  spaceId?: string;
  type: { id: string };
  toEntity: { id: string; name: string | null } | null;
  entity: { valuesList: HistoryValueNode[]; relationsList: HistoryRelationNode[] } | null;
};
export type HistoryEdgeNode = {
  id: string;
  entityId: string;
  spaceId?: string;
  toEntity: {
    id: string;
    name: string | null;
    /** The organisation's avatar relation, and its cover as a fallback. */
    avatar?: { toEntity: { valuesList: HistoryValueNode[] } | null }[];
    cover?: { toEntity: { valuesList: HistoryValueNode[] } | null }[];
  } | null;
  entity: { valuesList: HistoryValueNode[]; relationsList: HistoryRelationNode[] } | null;
};

export type NamedRef = { id: string; name: string | null };

/**
 * Everything hanging off a relation's own entity.
 *
 * Deleting the relation does not touch any of it — the store marks one row
 * deleted and nothing else — so removing a position has to name each of these or
 * leave the dates, the description and the skills behind as an entity nothing can
 * reach.
 */
/**
 * Everything on a relation's own entity, with the space each row lives in.
 *
 * The space matters because a proposal only reaches one of them: a row somebody
 * else wrote in another space is not ours to delete, and a tombstone for it would
 * be a delete op aimed at a space the row is not in. The SDK's own `deleteEntity`
 * scopes the same way, for the same reason.
 *
 * Values carry their property as well as their row id, because deleting one
 * publishes an `unset` keyed on the property — the id names the row without
 * saying what to clear.
 */
export type Subtree = {
  relations: { id: string; spaceId: string | null }[];
  values: { id: string; propertyId: string; spaceId: string | null }[];
};

const readSubtree = (entity: { valuesList: HistoryValueNode[]; relationsList: HistoryRelationNode[] } | null) => ({
  relations: (entity?.relationsList ?? []).map(relation => ({
    id: relation.id,
    spaceId: relation.spaceId ?? null,
  })),
  values: (entity?.valuesList ?? [])
    .filter((value): value is HistoryValueNode & { id: string } => Boolean(value.id))
    .map(value => ({ id: value.id, propertyId: value.property.id, spaceId: value.spaceId ?? null })),
});

/** One Employment/Education relation and the entity it carries. */
export type HistoryEdgeRef = {
  relationId: string;
  stintId: string;
  /** Where the relation itself lives, which is not always where its entity's rows do. */
  spaceId: string | null;
  subtree: Subtree;
};

/** One dated row under an organisation — a role held, or a degree read. */
export type HistoryEntry = {
  /** The Roles/Degree relation, which is what removing this row deletes. */
  relationId: string;
  /** The space that relation lives in; a removal cannot reach outside its own. */
  spaceId: string | null;
  /** That relation's own entity, which carries the dates and status. */
  tenureId: string;
  /**
   * The Employment/Education edge this row hangs off. Carried per row rather
   * than per card because one employer can have several edges — see the card.
   */
  edge: HistoryEdgeRef;
  /** What goes with this row when it is removed. */
  subtree: Subtree;
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
  /**
   * Published, but not readable yet.
   *
   * Shown so a save does not appear to have been lost while the indexer catches
   * up — but not editable: the row's real relation id is not on screen, so Edit
   * and Remove would act on a queue it is no longer in and silently do nothing.
   */
  isSettling?: boolean;
};

export type EmploymentEntry = HistoryEntry & {
  status: EmploymentStatus | null;
  employmentType: NamedRef | null;
  skills: NamedRef[];
  location: NamedRef | null;
  locationType: NamedRef | null;
};
export type EducationEntry = HistoryEntry & {
  status: EducationStatus | null;
  fields: NamedRef[];
  skills: NamedRef[];
  /** A mark, where the institution's was recorded. */
  grade: number | null;
};

/** An organisation and everything held there. One card in the resting state. */
export type HistoryCard<TEntry> = {
  /**
   * `isNew` where the organisation was typed into this modal and does not exist
   * yet. Carried because a second row added at that card has to know to write
   * the name and type too — whichever row ends up being the one published.
   */
  organization: NamedRef & { isNew?: boolean };
  /**
   * Every Employment/Education edge pointing at this organisation.
   *
   * Usually one. More where the same employer was added twice — by an older
   * version of this modal, by another tool, or by anyone who did not know a
   * second edge was not wanted. Those read as one employer here regardless,
   * since two cards for one company is a rendering fault as far as the person
   * looking at their own profile is concerned.
   */
  edges: HistoryEdgeRef[];
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

/**
 * A decimal off the graph. It arrives as a string — the endpoint serialises
 * BigFloat the way it serialises BigInt — so parsing is not optional.
 */
function decimalFor(values: HistoryValueNode[], propertyId: string) {
  const raw = valueFor(values, propertyId)?.decimal;
  if (raw === null || raw === undefined || raw === '') return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
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
  statusProperty: string,
  /** The type this relation's entity carries when it was written by this modal. */
  modernType: string
) {
  const tenureValues = relation.entity?.valuesList ?? [];
  const tenureRelations = relation.entity?.relationsList ?? [];

  const ownStart = dateFor(tenureValues, START_DATE_PROPERTY);
  const ownEnd = dateFor(tenureValues, END_DATE_PROPERTY);
  const ownStatus = relationTo(tenureRelations, statusProperty);
  const ownDescription = textFor(tenureValues, DESCRIPTION_PROPERTY);

  // Two things have to be true for the fallback to apply: the row carries nothing
  // of its own, and it is not one this modal wrote.
  //
  // Emptiness alone is not enough. A degree marked "Still studying" writes no
  // status by design, and its dates and description are optional — so a perfectly
  // modern row can be empty, and under a legacy school it would inherit that
  // school's old dates and status. The type on the relation's own entity is the
  // structural marker that tells them apart.
  const isModern = (relation.entity?.relationsList ?? []).some(
    row => row.type.id === SystemIds.TYPES_PROPERTY && row.toEntity?.id === modernType
  );
  const carriesNothing = ownStart === null && ownEnd === null && ownStatus === null && ownDescription === null;
  const isLegacy = carriesNothing && !isModern;

  return {
    relationId: relation.id,
    spaceId: relation.spaceId ?? null,
    tenureId: relation.entityId,
    subtree: readSubtree(relation.entity),
    subject: relation.toEntity ?? { id: relation.entityId, name: null },
    startDate: isLegacy ? dateFor(stintValues, START_DATE_PROPERTY) : ownStart,
    endDate: isLegacy ? dateFor(stintValues, END_DATE_PROPERTY) : ownEnd,
    description: isLegacy ? textFor(stintValues, DESCRIPTION_PROPERTY) : ownDescription,
    statusOptionId: (isLegacy ? relationTo(stintRelations, statusProperty) : ownStatus)?.id ?? null,
    isLegacy,
  };
}

/**
 * The organisation's avatar, picked the way every other image in the app is.
 *
 * Not simply the first value that holds a string: an image entity carries its own
 * name and a couple of dimensions alongside the URL, so that picked "Geo avatar"
 * and rendered nothing.
 */
/**
 * The organisation's picture: its avatar, or its cover where it has no avatar.
 *
 * Avatar first, because an organisation that has set both means the avatar as
 * its mark. A cover cropped square is still this organisation's own image and
 * beats the placeholder — plenty of companies in the graph have set only one.
 */
function readAvatar(edge: HistoryEdgeNode): string | null {
  const relations = [...(edge.toEntity?.avatar ?? []), ...(edge.toEntity?.cover ?? [])];

  for (const relation of relations) {
    const values = relation.toEntity?.valuesList ?? [];
    const url = findMediaUrlValue(values.map(value => ({ value: value.text, property: value.property })));
    if (url) return url;
  }
  return null;
}

/**
 * Edges to cards, one card per organisation.
 *
 * A second edge to an employer already listed folds into the card that is there
 * rather than starting another: someone with two roles at one company means one
 * employer, however many relations happen to record it.
 */
function readCards<TEntry extends HistoryEntry>(
  edges: HistoryEdgeNode[],
  readEntries: (
    edgeRef: HistoryEdgeRef,
    stintValues: HistoryValueNode[],
    stintRelations: HistoryRelationNode[]
  ) => TEntry[]
): HistoryCard<TEntry>[] {
  const byOrganization = new Map<string, HistoryCard<TEntry>>();

  for (const edge of edges) {
    const edgeRef: HistoryEdgeRef = {
      relationId: edge.id,
      stintId: edge.entityId,
      spaceId: edge.spaceId ?? null,
      subtree: readSubtree(edge.entity),
    };
    const organization = edge.toEntity ?? { id: edge.entityId, name: null };
    const entries = readEntries(edgeRef, edge.entity?.valuesList ?? [], edge.entity?.relationsList ?? []);

    const existing = byOrganization.get(organization.id);
    if (existing) {
      existing.edges.push(edgeRef);
      existing.entries = [...existing.entries, ...entries].sort(byMostRecent);
      // Whichever edge's organisation resolved an image first; they are the same
      // entity, so the second look adds nothing but can only be emptier.
      existing.avatarUrl = existing.avatarUrl ?? readAvatar(edge);
      continue;
    }

    byOrganization.set(organization.id, {
      organization,
      edges: [edgeRef],
      avatarUrl: readAvatar(edge),
      entries,
    });
  }

  return [...byOrganization.values()].sort(byMostRecentCard);
}

/**
 * Employers newest first, by the most recent thing held at each.
 *
 * Entries inside a card are already sorted, so the first one speaks for the card:
 * a current job puts its employer at the top, which is the order a CV is read in
 * and the order the graph happens to return records in only by accident.
 */
export function byMostRecentCard<TEntry extends HistoryEntry>(a: HistoryCard<TEntry>, b: HistoryCard<TEntry>) {
  const first = a.entries[0];
  const second = b.entries[0];
  if (!first || !second) return first ? -1 : second ? 1 : 0;
  return byMostRecent(first, second);
}

export function normalizeEmployment(edges: HistoryEdgeNode[]): EmploymentCard[] {
  return readCards<EmploymentEntry>(edges, (edgeRef, stintValues, stintRelations) =>
    stintRelations
      .filter(relation => relation.type.id === ROLES_PROPERTY)
      .map(relation => {
        const { statusOptionId, ...entry } = readEntry(
          relation,
          stintValues,
          stintRelations,
          EMPLOYMENT_STATUS_PROPERTY,
          ROLE_INFORMATION_TYPE
        );
        const tenureRelations = relation.entity?.relationsList ?? [];

        return {
          ...entry,
          edge: edgeRef,
          status: employmentStatusFromOptionId(statusOptionId),
          employmentType: relationTo(tenureRelations, EMPLOYMENT_TYPE_PROPERTY),
          location: relationTo(tenureRelations, LOCATION_PROPERTY),
          locationType: relationTo(tenureRelations, LOCATION_TYPE_PROPERTY),
          skills: tenureRelations
            .filter(skill => skill.type.id === SKILLS_PROPERTY)
            .map(skill => skill.toEntity)
            .filter((skill): skill is NamedRef => skill !== null),
        };
      })
      .sort(byMostRecent)
  );
}

export function normalizeEducation(edges: HistoryEdgeNode[]): EducationCard[] {
  return readCards<EducationEntry>(edges, (edgeRef, stintValues, stintRelations) =>
    stintRelations
      .filter(relation => relation.type.id === DEGREE_PROPERTY)
      .map(relation => {
        const { statusOptionId, ...entry } = readEntry(
          relation,
          stintValues,
          stintRelations,
          EDUCATION_STATUS_PROPERTY,
          DEGREE_INFORMATION_TYPE
        );

        const enrolmentRelations = relation.entity?.relationsList ?? [];
        const enrolmentValues = relation.entity?.valuesList ?? [];
        const fields = enrolmentRelations
          .filter(field => field.type.id === FIELDS_OF_STUDY_PROPERTY)
          .map(field => field.toEntity)
          .filter((field): field is NamedRef => field !== null);

        // Eleven records predate `Fields of study` and keep the discipline as
        // text on the stint. Shown, never written — they are the seed for real
        // Field of study entities rather than a second way to store one.
        //
        // Only for the rows it belongs to, the same way the dates and status
        // above fall back. The text sits on the stint, which a modern row can
        // share: ungated, clearing a field put the old discipline straight back,
        // and a degree added under an old record inherited someone else's.
        const legacyField = entry.isLegacy ? textFor(stintValues, LEGACY_FIELD_OF_STUDY_PROPERTY) : null;

        return {
          ...entry,
          edge: edgeRef,
          status: educationStatusFromOptionId(statusOptionId),
          fields: fields.length > 0 || legacyField === null ? fields : [{ id: '', name: legacyField }],
          skills: enrolmentRelations
            .filter(skill => skill.type.id === SKILLS_PROPERTY)
            .map(skill => skill.toEntity)
            .filter((skill): skill is NamedRef => skill !== null),
          grade: decimalFor(enrolmentValues, GRADE_PROPERTY),
        };
      })
      .sort(byMostRecent)
  );
}

/**
 * Whether a row is still running.
 *
 * A missing end date does not say so on its own. Plenty of finished roles and
 * degrees have no end recorded — the status is what tells them apart, and
 * reading the gap as "still there" sorted a completed 2022 degree ahead of one
 * that ended in 2024, and measured its duration up to today.
 *
 * Only "current" and "studying" are open; "former", "completed" and "incomplete"
 * are not. A row from before the status existed has none, and falls back to the
 * old reading of a missing end date.
 *
 * The single definition of this: the row, its duration, the card's duration and
 * the sort order all derive openness from here, having each answered it
 * differently before.
 */
export function isOngoing(entry: { endDate: string | null; status?: string | null }) {
  if (entry.endDate !== null) return false;
  return entry.status == null || entry.status === 'current' || entry.status === 'studying';
}

/**
 * Most recent first, and anything still open ahead of anything ended. A row with
 * no dates at all sorts last rather than jumping the list on an empty string.
 *
 * Exported so the pending rows in the modal sort the same way the saved ones do.
 * They used to sit in the order they were added, so a promotion entered after the
 * job before it read as the older of the two until the page was saved and
 * refetched.
 */
export function byMostRecent(a: HistoryEntry, b: HistoryEntry) {
  const aOpen = a.startDate !== null && isOngoing(a);
  const bOpen = b.startDate !== null && isOngoing(b);
  if (aOpen !== bOpen) return aOpen ? -1 : 1;

  const aKey = a.endDate ?? a.startDate;
  const bKey = b.endDate ?? b.startDate;
  if (aKey === bKey) return 0;
  if (aKey === null) return 1;
  if (bKey === null) return -1;
  return bKey.localeCompare(aKey);
}
