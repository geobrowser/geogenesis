import { describe, expect, it, vi } from 'vitest';

import {
  type GraphCardMeta,
  buildGraphCardMetadata,
  decodeGraphCardMeta,
  parseGraphRouteIds,
  truncateAtWord,
} from './graph-card-metadata';
import { GRAPH_KIND_TYPE_IDS } from './graph-kinds';

vi.mock('~/core/opengraph', () => ({
  firstLine: (text: string | null | undefined) => text?.split('\n')[0]?.trim() || undefined,
}));

const TOPIC = '4ed3162278994f29bde7a6f7cf60e28e';
const SPACE = '89bd89bf28ff8a0963faf92a8c905e20';
const PERSON = '3689bd216406451a9e506e85d1e397d7';
const TOPIC_TYPE = GRAPH_KIND_TYPE_IDS.topic[0];
const PERSON_TYPE = GRAPH_KIND_TYPE_IDS.ent[0];
const CLAIM_TYPE = GRAPH_KIND_TYPE_IDS.claim[0];

const meta = (
  centre: Partial<GraphCardMeta['centre']>,
  topic: GraphCardMeta['topic'] = { id: TOPIC, name: 'Israel-Gaza war' }
): GraphCardMeta => ({
  centre: { id: TOPIC, name: 'Israel-Gaza war', description: null, types: [], kind: 'topic', image: null, ...centre },
  topic,
});

const raw = (id: string, name: string | null, typeId: string, hidden?: { text?: string; boolean?: boolean }) => ({
  id,
  name,
  description: 'First line.\nSecond.',
  types: [{ id: typeId, name: null }],
  relationsList: [],
  hidden: hidden ? [{ text: hidden.text ?? null, boolean: hidden.boolean ?? null }] : [],
});

describe('buildGraphCardMetadata', () => {
  it('titles a topic centre, another centre in the topic, and a long claim', () => {
    expect(buildGraphCardMetadata(meta({}), { topicId: TOPIC, spaceId: null }).title).toBe(
      'Israel-Gaza war · Connections on Geo'
    );
    expect(
      buildGraphCardMetadata(meta({ id: PERSON, name: 'Isaac Herzog', kind: 'ent' }), { topicId: TOPIC, spaceId: null })
        .title
    ).toBe('Isaac Herzog in Israel-Gaza war · Connections on Geo');
    const claim =
      'Israel’s military campaign and siege restrictions in Gaza meet the legal threshold of genocide under the Genocide Convention';
    const title = buildGraphCardMetadata(meta({ id: PERSON, name: claim, kind: 'claim' }), {
      topicId: TOPIC,
      spaceId: null,
    }).title as string;
    expect(title).toBe(
      'Israel’s military campaign and siege restrictions in Gaza meet the legal threshold of… in Israel-Gaza war · Connections on Geo'
    );
  });

  it('drops "in {topic}" when the topic is unknown', () => {
    const built = buildGraphCardMetadata(meta({ id: PERSON, name: 'Isaac Herzog', kind: 'ent' }, null), {
      topicId: TOPIC,
      spaceId: null,
    });
    expect(built.title).toBe('Isaac Herzog · Connections on Geo');
    expect(built.description).toBe('Explore how Isaac Herzog connects to people, claims, news and sources.');
  });

  it('describes with the first line, else the fallback', () => {
    expect(
      buildGraphCardMetadata(meta({ description: 'One.\nTwo.' }), { topicId: TOPIC, spaceId: null }).description
    ).toBe('One.');
    expect(
      buildGraphCardMetadata(meta({ id: PERSON, name: 'Isaac Herzog', kind: 'ent' }), { topicId: TOPIC, spaceId: null })
        .description
    ).toBe('Explore how Isaac Herzog connects to people, claims, news and sources in Israel-Gaza war.');
  });

  it('points canonical and the card at centre, topic and space only, outside /api/', () => {
    const built = buildGraphCardMetadata(meta({ id: PERSON, name: 'Isaac Herzog', kind: 'ent' }), {
      topicId: TOPIC.toUpperCase(),
      spaceId: SPACE,
    });
    expect(built.alternates?.canonical).toBe(`/explore/graph/${PERSON}?topic=${TOPIC}&space=${SPACE}`);
    const image = (built.openGraph?.images as Array<{ url: string; width: number; height: number }>)[0];
    expect(image.url).toBe(`/explore/graph/${PERSON}/card?topic=${TOPIC}&space=${SPACE}&v=1`);
    expect(image.url).not.toContain('/api/');
    expect([image.width, image.height]).toEqual([1200, 630]);
    expect(built.twitter).toMatchObject({
      card: 'summary_large_image',
      site: '@geobrowser',
      images: [image.url],
    });
    expect(built.robots).toEqual({ index: false, follow: true });
  });
});

describe('parseGraphRouteIds', () => {
  it('rejects a bad centre and drops bad or filter params', () => {
    expect(parseGraphRouteIds('nope', { topic: TOPIC })).toBeNull();
    expect(parseGraphRouteIds(PERSON, { topic: 'x', space: SPACE })).toEqual({
      entityId: PERSON,
      topicId: null,
      spaceId: SPACE,
    });
    expect(parseGraphRouteIds(PERSON, { topic: [TOPIC, 'x'] })).toEqual({
      entityId: PERSON,
      topicId: TOPIC,
      spaceId: null,
    });
  });
});

describe('decodeGraphCardMeta', () => {
  it('returns nothing for an unknown, unnamed or hidden centre', () => {
    expect(decodeGraphCardMeta({ centre: null, topic: raw(TOPIC, 'Israel-Gaza war', TOPIC_TYPE) })).toBeNull();
    expect(decodeGraphCardMeta({ centre: raw(PERSON, ' ', PERSON_TYPE), topic: null })).toBeNull();
    expect(
      decodeGraphCardMeta({ centre: raw(PERSON, 'Secret', PERSON_TYPE, { text: 'true' }), topic: null })
    ).toBeNull();
    expect(
      decodeGraphCardMeta({ centre: raw(PERSON, 'Secret', PERSON_TYPE, { boolean: true }), topic: null })
    ).toBeNull();
  });

  it('never names a hidden topic', () => {
    const decoded = decodeGraphCardMeta({
      centre: raw(PERSON, 'Isaac Herzog', PERSON_TYPE),
      topic: raw(TOPIC, 'Hidden topic', TOPIC_TYPE, { text: '1' }),
    });
    expect(decoded?.topic).toBeNull();
    expect(decoded?.centre).toMatchObject({ name: 'Isaac Herzog', kind: 'ent', description: 'First line.\nSecond.' });
  });

  it('reads the kind from the types', () => {
    expect(decodeGraphCardMeta({ centre: raw(PERSON, 'A claim', CLAIM_TYPE), topic: null })?.centre.kind).toBe('claim');
  });
});

describe('truncateAtWord', () => {
  it('cuts at a word boundary', () => {
    expect(truncateAtWord('short', 90)).toBe('short');
    expect(truncateAtWord('alpha beta gamma', 12)).toBe('alpha beta…');
  });
});
