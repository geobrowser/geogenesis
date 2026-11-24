import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { TEMPLATE_ONTOLOGY } from '../ontology';
import {
  type TemplateAddOwner,
  buildClaimEdits,
  buildEventEdits,
  buildQuoteEdits,
  toStoredDate,
} from './template-add-edits';

const SPACE = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const PAGE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function owner(ownerKind: TemplateAddOwner['ownerKind']): TemplateAddOwner {
  return { entityId: PAGE, entityName: 'Page', ownerKind };
}

function link(edits: NonNullable<ReturnType<typeof buildClaimEdits>>) {
  const rel = edits.relations.find(r => r.type.id !== SystemIds.TYPES_PROPERTY)!;
  return { type: rel.type.id, from: rel.fromEntity.id, to: rel.toEntity.id, toSpaceId: rel.toSpaceId };
}

describe('buildClaimEdits', () => {
  it('writes the claim, its type and kind into the given space, all local and unpublished', () => {
    const edits = buildClaimEdits(owner('topic'), { title: ' Rates fell ', kind: 'fact', note: 'BLS' }, SPACE)!;

    expect(edits.name).toBe('Rates fell');
    expect([...edits.values, ...edits.relations].every(row => row.spaceId === SPACE)).toBe(true);
    expect([...edits.values, ...edits.relations].every(row => row.isLocal && !row.hasBeenPublished)).toBe(true);
    expect(edits.values.map(v => [v.property.id, v.value])).toEqual([
      [SystemIds.NAME_PROPERTY, 'Rates fell'],
      [TEMPLATE_ONTOLOGY.CLAIM_IS_FACTUAL_PROPERTY_ID, '1'],
      [SystemIds.DESCRIPTION_PROPERTY, 'BLS'],
    ]);
    expect(edits.relations[0]).toMatchObject({
      type: { id: SystemIds.TYPES_PROPERTY },
      fromEntity: { id: edits.entityId },
      toEntity: { id: TEMPLATE_ONTOLOGY.CLAIM_TYPE_ID },
    });
  });

  it('links to the page by the kind of page and the stance', () => {
    const claim = { title: 'A claim', kind: 'judgment' as const };
    const topic = buildClaimEdits(owner('topic'), claim, SPACE)!;
    expect(link(topic)).toEqual({
      type: TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID,
      from: topic.entityId,
      to: PAGE,
      toSpaceId: undefined,
    });

    const supports = buildClaimEdits(owner('claim'), { ...claim, stance: 'supports' }, SPACE)!;
    expect(link(supports)).toMatchObject({ type: TEMPLATE_ONTOLOGY.CLAIM_SUPPORTS_PROPERTY_ID, to: PAGE });
    const opposes = buildClaimEdits(owner('claim'), { ...claim, stance: 'opposes' }, SPACE)!;
    expect(link(opposes)).toMatchObject({ type: TEMPLATE_ONTOLOGY.CLAIM_OPPOSES_PROPERTY_ID, to: PAGE });

    // Links from the page carry the space the claim lives in.
    const related = buildClaimEdits(owner('claim'), { ...claim, stance: 'addresses' }, SPACE)!;
    expect(link(related)).toEqual({
      type: TEMPLATE_ONTOLOGY.SUBCLAIMS_PROPERTY_ID,
      from: PAGE,
      to: related.entityId,
      toSpaceId: SPACE,
    });
    const episode = buildClaimEdits(owner('episode'), claim, SPACE)!;
    expect(link(episode)).toMatchObject({ type: TEMPLATE_ONTOLOGY.NOTABLE_CLAIMS_PROPERTY_ID, from: PAGE });
    const source = buildClaimEdits(owner('source'), claim, SPACE)!;
    expect(link(source)).toMatchObject({ type: TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID, to: PAGE });
    const story = buildClaimEdits(owner('news-story'), claim, SPACE)!;
    expect(link(story)).toMatchObject({ type: TEMPLATE_ONTOLOGY.RELATED_CLAIMS_PROPERTY_ID, from: PAGE });
  });

  it("a link to the page from a personal-space edit names the page's space", () => {
    const PAGE_SPACE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const page = { ...owner('topic'), spaceId: PAGE_SPACE };
    expect(link(buildClaimEdits(page, { title: 'A claim', kind: 'fact' }, SPACE)!).toSpaceId).toBe(PAGE_SPACE);
    expect(link(buildEventEdits(page, { title: 'Vote', when: '' }, SPACE)!).toSpaceId).toBe(PAGE_SPACE);
    const source = { ...owner('source'), spaceId: PAGE_SPACE };
    expect(link(buildQuoteEdits(source, { text: 'We will' }, SPACE)!).toSpaceId).toBe(PAGE_SPACE);
    // In the page's own space the link needs no space.
    expect(link(buildClaimEdits(page, { title: 'A claim', kind: 'fact' }, PAGE_SPACE)!).toSpaceId).toBeUndefined();
  });

  it('builds nothing for an empty title', () => {
    expect(buildClaimEdits(owner('topic'), { title: '  ', kind: 'fact' }, SPACE)).toBeNull();
  });
});

describe('buildEventEdits', () => {
  it('stores a readable date as a DATE and tags the topic', () => {
    const edits = buildEventEdits(owner('topic'), { title: 'Vote', when: '18 Nov 2026', summary: 'Passed' }, SPACE)!;
    expect(edits.values.map(v => [v.property.id, v.value])).toEqual([
      [SystemIds.NAME_PROPERTY, 'Vote'],
      [SystemIds.DESCRIPTION_PROPERTY, 'Passed'],
      [TEMPLATE_ONTOLOGY.EVENT_DATE_PROPERTY_ID, '2026-11-18T00:00:00.000Z'],
    ]);
    expect(edits.relations.map(r => r.toEntity.id)).toEqual([TEMPLATE_ONTOLOGY.NEWS_EVENT_TYPE_ID, PAGE]);
  });

  it('keeps an unreadable date in the summary rather than failing the publish', () => {
    const edits = buildEventEdits(owner('topic'), { title: 'Vote', when: 'last week', summary: 'Passed' }, SPACE)!;
    expect(edits.values.find(v => v.property.id === TEMPLATE_ONTOLOGY.EVENT_DATE_PROPERTY_ID)).toBeUndefined();
    expect(edits.values.find(v => v.property.id === SystemIds.DESCRIPTION_PROPERTY)?.value).toBe('last week. Passed');
  });
});

describe('toStoredDate', () => {
  it('keeps the calendar day typed', () => {
    expect(toStoredDate('2026-11-18')).toBe('2026-11-18T00:00:00.000Z');
    expect(toStoredDate('Nov 18, 2026')).toBe('2026-11-18T00:00:00.000Z');
    expect(toStoredDate('soon')).toBeNull();
    expect(toStoredDate('2026-02-30')).toBeNull();
    expect(toStoredDate('2026-13-01')).toBeNull();
    expect(toStoredDate('2026-00-01')).toBeNull();
  });
});

describe('buildQuoteEdits', () => {
  it('an episode quote hangs off the episode; a source quote cites the source', () => {
    const episode = buildQuoteEdits(owner('episode'), { text: 'We will', speaker: 'Host' }, SPACE)!;
    expect(link(episode)).toEqual({
      type: TEMPLATE_ONTOLOGY.QUOTES_PROPERTY_ID,
      from: PAGE,
      to: episode.entityId,
      toSpaceId: SPACE,
    });
    expect(episode.values.find(v => v.property.id === SystemIds.DESCRIPTION_PROPERTY)?.value).toBe('Host');

    const source = buildQuoteEdits(owner('source'), { text: 'We will', speaker: 'ICJ', location: '§86' }, SPACE)!;
    expect(link(source)).toMatchObject({
      type: TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID,
      from: source.entityId,
      to: PAGE,
    });
    expect(source.values.find(v => v.property.id === SystemIds.DESCRIPTION_PROPERTY)?.value).toBe('ICJ, §86');
  });
});
