import { IdUtils, Position, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { ID } from '~/core/id';
import type { DataType, Relation, Value } from '~/core/types';

import type { ClaimKind, ClaimStance } from '../models';
import { TEMPLATE_ONTOLOGY } from '../ontology';

export type TemplateOwnerKind = 'topic' | 'claim' | 'source' | 'event' | 'news-story' | 'post' | 'podcast' | 'episode';

export type ClaimDraft = { title: string; kind: ClaimKind; stance?: ClaimStance; note?: string };
export type EventDraft = { title: string; when?: string; summary?: string };
export type QuoteDraft = { text: string; speaker?: string; location?: string };

/** What a template `+` adds, as it is queued across sign-up (JSON in the queue's `intent`). */
export type TemplateAddAction =
  { kind: 'claim'; draft: ClaimDraft } | { kind: 'event'; draft: EventDraft } | { kind: 'quote'; draft: QuoteDraft };

/** The page the `+` was pressed on. */
/** `spaceId` is the page's own space, which links to the page carry when the edit goes elsewhere. */
export type TemplateAddOwner = {
  entityId: string;
  entityName: string;
  ownerKind: TemplateOwnerKind;
  spaceId?: string;
};

/** A link to the page from an edit in another space (a personal space) names the page's space. */
function toPage(owner: TemplateAddOwner, spaceId: string, relation: Relation): Relation {
  return owner.spaceId && owner.spaceId !== spaceId ? { ...relation, toSpaceId: owner.spaceId } : relation;
}

/** One new entity and every value and relation that makes it and links it to the page. */
export type TemplateAddEdits = { entityId: string; name: string; values: Value[]; relations: Relation[] };

export function makeLocalRelation({
  spaceId,
  typeId,
  typeName,
  fromId,
  fromName,
  toId,
  toName,
}: {
  spaceId: string;
  typeId: string;
  typeName: string;
  fromId: string;
  fromName: string | null;
  toId: string;
  toName: string | null;
}): Relation {
  return {
    id: IdUtils.generate(),
    entityId: IdUtils.generate(),
    spaceId,
    position: Position.generate(),
    renderableType: 'RELATION',
    isLocal: true,
    hasBeenPublished: false,
    isDeleted: false,
    type: { id: typeId, name: typeName },
    fromEntity: { id: fromId, name: fromName },
    toEntity: { id: toId, name: toName, value: toId },
  };
}

function makeLocalValue({
  spaceId,
  entityId,
  entityName,
  propertyId,
  propertyName,
  dataType,
  value,
}: {
  spaceId: string;
  entityId: string;
  entityName: string;
  propertyId: string;
  propertyName: string;
  dataType: DataType;
  value: string;
}): Value {
  return {
    id: ID.createValueId({ entityId, propertyId, spaceId }),
    entity: { id: entityId, name: entityName },
    property: {
      id: propertyId,
      name: propertyName,
      dataType,
      renderableType: propertyId === SystemIds.NAME_PROPERTY ? 'TEXT' : null,
    },
    spaceId,
    value,
    isLocal: true,
    hasBeenPublished: false,
    isDeleted: false,
  };
}

/** The relation linking a new claim to the page, by the kind of page it is. */
function claimLink(
  owner: TemplateAddOwner,
  stance: ClaimStance | undefined
): { typeId: string; typeName: string; fromPage: boolean } {
  switch (owner.ownerKind) {
    case 'topic':
      return { typeId: TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID, typeName: 'Topics', fromPage: false };
    case 'claim':
      if (stance === 'supports') {
        return { typeId: TEMPLATE_ONTOLOGY.CLAIM_SUPPORTS_PROPERTY_ID, typeName: 'Supports', fromPage: false };
      }
      if (stance === 'opposes') {
        return { typeId: TEMPLATE_ONTOLOGY.CLAIM_OPPOSES_PROPERTY_ID, typeName: 'Opposes', fromPage: false };
      }
      return { typeId: TEMPLATE_ONTOLOGY.SUBCLAIMS_PROPERTY_ID, typeName: 'Subclaims', fromPage: true };
    case 'source':
      return { typeId: TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID, typeName: 'Sources', fromPage: false };
    case 'episode':
      return { typeId: TEMPLATE_ONTOLOGY.NOTABLE_CLAIMS_PROPERTY_ID, typeName: 'Notable claims', fromPage: true };
    default:
      return { typeId: TEMPLATE_ONTOLOGY.RELATED_CLAIMS_PROPERTY_ID, typeName: 'Related claims', fromPage: true };
  }
}

export function buildClaimEdits(owner: TemplateAddOwner, draft: ClaimDraft, spaceId: string): TemplateAddEdits | null {
  const title = draft.title.trim();
  if (!title) return null;

  const claimId = ID.createEntityId();
  const value = (propertyId: string, propertyName: string, dataType: DataType, v: string) =>
    makeLocalValue({ spaceId, entityId: claimId, entityName: title, propertyId, propertyName, dataType, value: v });

  const values = [
    value(SystemIds.NAME_PROPERTY, 'Name', 'TEXT', title),
    value(TEMPLATE_ONTOLOGY.CLAIM_IS_FACTUAL_PROPERTY_ID, 'Is factual', 'BOOLEAN', draft.kind === 'fact' ? '1' : '0'),
  ];
  const note = draft.note?.trim();
  if (note) values.push(value(SystemIds.DESCRIPTION_PROPERTY, 'Description', 'TEXT', note));

  const link = claimLink(owner, draft.stance);
  const relations = [
    makeLocalRelation({
      spaceId,
      typeId: SystemIds.TYPES_PROPERTY,
      typeName: 'Types',
      fromId: claimId,
      fromName: title,
      toId: TEMPLATE_ONTOLOGY.CLAIM_TYPE_ID,
      toName: 'Claim',
    }),
    link.fromPage
      ? {
          ...makeLocalRelation({
            spaceId,
            typeId: link.typeId,
            typeName: link.typeName,
            fromId: owner.entityId,
            fromName: owner.entityName,
            toId: claimId,
            toName: title,
          }),
          // The claim lives in the space this edit goes to, which the page's list links into.
          toSpaceId: spaceId,
        }
      : toPage(
          owner,
          spaceId,
          makeLocalRelation({
            spaceId,
            typeId: link.typeId,
            typeName: link.typeName,
            fromId: claimId,
            fromName: title,
            toId: owner.entityId,
            toName: owner.entityName,
          })
        ),
  ];

  return { entityId: claimId, name: title, values, relations };
}

/**
 * The form's free-text date as the stored DATE form (`YYYY-MM-DDT00:00:00.000Z`), or null when it
 * isn't a date. The calendar day is read in local time, so "18 Nov 2026" stays the 18th everywhere.
 */
export function toStoredDate(text: string): string | null {
  const isoDay = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const date = isoDay ? new Date(Number(isoDay[1]), Number(isoDay[2]) - 1, Number(isoDay[3])) : new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  // `new Date(2026, 1, 30)` rolls over to March 2; an impossible day is no date.
  if (isoDay && (date.getMonth() + 1 !== Number(isoDay[2]) || date.getDate() !== Number(isoDay[3]))) return null;
  const yyyy = String(date.getFullYear()).padStart(4, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T00:00:00.000Z`;
}

export function buildEventEdits(owner: TemplateAddOwner, draft: EventDraft, spaceId: string): TemplateAddEdits | null {
  const title = draft.title.trim();
  if (!title) return null;

  const eventId = ID.createEntityId();
  const value = (propertyId: string, propertyName: string, dataType: DataType, v: string) =>
    makeLocalValue({ spaceId, entityId: eventId, entityName: title, propertyId, propertyName, dataType, value: v });

  const values = [value(SystemIds.NAME_PROPERTY, 'Name', 'TEXT', title)];
  const when = draft.when?.trim();
  const eventDate = when ? toStoredDate(when) : null;
  // A date the publish can't read would fail the whole edit, so unreadable text stays in the summary.
  const summary = [when && !eventDate ? when : null, draft.summary?.trim() || null].filter(Boolean).join('. ');
  if (summary) values.push(value(SystemIds.DESCRIPTION_PROPERTY, 'Description', 'TEXT', summary));
  if (eventDate) values.push(value(TEMPLATE_ONTOLOGY.EVENT_DATE_PROPERTY_ID, 'Event date', 'DATE', eventDate));

  const relations = [
    makeLocalRelation({
      spaceId,
      typeId: SystemIds.TYPES_PROPERTY,
      typeName: 'Types',
      fromId: eventId,
      fromName: title,
      toId: TEMPLATE_ONTOLOGY.NEWS_EVENT_TYPE_ID,
      toName: 'News event',
    }),
    toPage(
      owner,
      spaceId,
      makeLocalRelation({
        spaceId,
        typeId: TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID,
        typeName: 'Topics',
        fromId: eventId,
        fromName: title,
        toId: owner.entityId,
        toName: owner.entityName,
      })
    ),
  ];

  return { entityId: eventId, name: title, values, relations };
}

export function buildQuoteEdits(owner: TemplateAddOwner, draft: QuoteDraft, spaceId: string): TemplateAddEdits | null {
  const text = draft.text.trim();
  if (!text) return null;

  const quoteId = ID.createEntityId();
  const value = (propertyId: string, propertyName: string, dataType: DataType, v: string) =>
    makeLocalValue({ spaceId, entityId: quoteId, entityName: text, propertyId, propertyName, dataType, value: v });

  const values = [value(SystemIds.NAME_PROPERTY, 'Name', 'TEXT', text)];
  const attribution = [draft.speaker?.trim(), draft.location?.trim()].filter(Boolean).join(', ');
  if (attribution) values.push(value(SystemIds.DESCRIPTION_PROPERTY, 'Description', 'TEXT', attribution));

  const relations = [
    makeLocalRelation({
      spaceId,
      typeId: SystemIds.TYPES_PROPERTY,
      typeName: 'Types',
      fromId: quoteId,
      fromName: text,
      toId: TEMPLATE_ONTOLOGY.QUOTE_TYPE_ID,
      toName: 'Quote',
    }),
    owner.ownerKind === 'episode'
      ? {
          ...makeLocalRelation({
            spaceId,
            typeId: TEMPLATE_ONTOLOGY.QUOTES_PROPERTY_ID,
            typeName: 'Quotes',
            fromId: owner.entityId,
            fromName: owner.entityName,
            toId: quoteId,
            toName: text,
          }),
          toSpaceId: spaceId,
        }
      : toPage(
          owner,
          spaceId,
          makeLocalRelation({
            spaceId,
            typeId: TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID,
            typeName: 'Sources',
            fromId: quoteId,
            fromName: text,
            toId: owner.entityId,
            toName: owner.entityName,
          })
        ),
  ];

  return { entityId: quoteId, name: text, values, relations };
}

export function buildTemplateAddEdits(
  owner: TemplateAddOwner,
  action: TemplateAddAction,
  spaceId: string
): TemplateAddEdits | null {
  switch (action.kind) {
    case 'claim':
      return buildClaimEdits(owner, action.draft, spaceId);
    case 'event':
      return buildEventEdits(owner, action.draft, spaceId);
    case 'quote':
      return buildQuoteEdits(owner, action.draft, spaceId);
  }
}
