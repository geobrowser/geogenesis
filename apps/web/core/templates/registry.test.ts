import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { NEWS_STORY_TYPE_ID, TOPIC_TYPE_ID } from '~/core/constants';
import {
  ARTICLE_TYPE_ID,
  DATASET_TYPE_ID,
  EPISODE_TYPE_ID,
  OFFICIAL_DOCUMENT_TYPE_ID,
  PAPER_TYPE_ID,
  POST_TYPE_ID,
  TWEET_TYPE_ID,
} from '~/core/topics/ontology';

import { TEMPLATE_ONTOLOGY } from './ontology';
import {
  ENTITY_TEMPLATE_REGISTRY,
  getEntityTemplateDefinition,
  isV2EntityTemplateId,
  resolveEntityTemplateFromTypes,
} from './registry';

describe('ENTITY_TEMPLATE_REGISTRY', () => {
  it('resolves stable templates in precedence order without the v2 flag', () => {
    expect(
      resolveEntityTemplateFromTypes([{ id: SystemIds.PERSON_TYPE }, { id: TOPIC_TYPE_ID }, { id: CLAIM_TYPE_ID }])?.id
    ).toBe('claim');

    expect(resolveEntityTemplateFromTypes([{ id: SystemIds.PERSON_TYPE }, { id: TOPIC_TYPE_ID }])?.id).toBe('topic');
    expect(resolveEntityTemplateFromTypes([{ id: SystemIds.PERSON_TYPE }])?.id).toBe('person');
  });

  it('withholds v2 templates unless includeV2 is enabled', () => {
    expect(resolveEntityTemplateFromTypes([{ id: ContentIds.NEWS_EVENT_TYPE }])).toBeNull();
    expect(resolveEntityTemplateFromTypes([{ id: NEWS_STORY_TYPE_ID }])).toBeNull();
    expect(resolveEntityTemplateFromTypes([{ id: TEMPLATE_ONTOLOGY.PODCAST_TYPE_ID }])).toBeNull();
    expect(resolveEntityTemplateFromTypes([{ id: EPISODE_TYPE_ID }])).toBeNull();
    expect(resolveEntityTemplateFromTypes([{ id: OFFICIAL_DOCUMENT_TYPE_ID }])).toBeNull();
    expect(resolveEntityTemplateFromTypes([{ id: TWEET_TYPE_ID }])).toBeNull();

    expect(resolveEntityTemplateFromTypes([{ id: ContentIds.NEWS_EVENT_TYPE }], { includeV2: true })?.id).toBe('event');
    expect(resolveEntityTemplateFromTypes([{ id: NEWS_STORY_TYPE_ID }], { includeV2: true })?.id).toBe('news-story');
    expect(resolveEntityTemplateFromTypes([{ id: TEMPLATE_ONTOLOGY.PODCAST_TYPE_ID }], { includeV2: true })?.id).toBe(
      'podcast'
    );
    expect(resolveEntityTemplateFromTypes([{ id: EPISODE_TYPE_ID }], { includeV2: true })?.id).toBe('episode');
    expect(resolveEntityTemplateFromTypes([{ id: OFFICIAL_DOCUMENT_TYPE_ID }], { includeV2: true })?.id).toBe('source');
    expect(resolveEntityTemplateFromTypes([{ id: DATASET_TYPE_ID }], { includeV2: true })?.id).toBe('source');
    expect(resolveEntityTemplateFromTypes([{ id: PAPER_TYPE_ID }], { includeV2: true })?.id).toBe('source');
    expect(resolveEntityTemplateFromTypes([{ id: ARTICLE_TYPE_ID }], { includeV2: true })?.id).toBe('source');
    expect(resolveEntityTemplateFromTypes([{ id: TWEET_TYPE_ID }], { includeV2: true })?.id).toBe('post');
    expect(resolveEntityTemplateFromTypes([{ id: POST_TYPE_ID }], { includeV2: true })?.id).toBe('post');
  });

  it('gives narrower templates precedence over broader ones when v2 is enabled', () => {
    expect(
      resolveEntityTemplateFromTypes(
        [{ id: SystemIds.PERSON_TYPE }, { id: OFFICIAL_DOCUMENT_TYPE_ID }, { id: NEWS_STORY_TYPE_ID }],
        { includeV2: true }
      )?.id
    ).toBe('news-story');

    expect(
      resolveEntityTemplateFromTypes([{ id: NEWS_STORY_TYPE_ID }, { id: TOPIC_TYPE_ID }], { includeV2: true })?.id
    ).toBe('topic');
  });

  // Every News event in the graph is also typed Claim (GEO-3819). They are written for the Event page,
  // so Event wins once v2 is on; with v2 off they keep the Claim page they had.
  it('gives Event precedence over Claim for an entity typed both', () => {
    const dualTyped = [{ id: CLAIM_TYPE_ID }, { id: ContentIds.NEWS_EVENT_TYPE }];

    expect(resolveEntityTemplateFromTypes(dualTyped, { includeV2: true })?.id).toBe('event');
    expect(resolveEntityTemplateFromTypes([...dualTyped].reverse(), { includeV2: true })?.id).toBe('event');
    expect(resolveEntityTemplateFromTypes(dualTyped)?.id).toBe('claim');
    expect(resolveEntityTemplateFromTypes([{ id: CLAIM_TYPE_ID }], { includeV2: true })?.id).toBe('claim');
  });

  it('matches dashed and undashed UUID forms', () => {
    const dashedNews = `${NEWS_STORY_TYPE_ID.slice(0, 8)}-${NEWS_STORY_TYPE_ID.slice(8, 12)}-${NEWS_STORY_TYPE_ID.slice(12, 16)}-${NEWS_STORY_TYPE_ID.slice(16, 20)}-${NEWS_STORY_TYPE_ID.slice(20)}`;
    expect(resolveEntityTemplateFromTypes([{ id: dashedNews }], { includeV2: true })?.id).toBe('news-story');
  });

  it('exposes consistent metadata for every registered template', () => {
    expect(ENTITY_TEMPLATE_REGISTRY.map(entry => entry.id)).toEqual([
      'event',
      'claim',
      'topic',
      'news-story',
      'podcast',
      'episode',
      'source',
      'post',
      'person',
    ]);
    expect(getEntityTemplateDefinition('claim').keepInEditMode).toBe(true);
    expect(getEntityTemplateDefinition('topic').keepInEditMode).toBe(true);
    expect(getEntityTemplateDefinition('person').requiresSpaceCheck).toBe(true);
    expect(isV2EntityTemplateId('claim')).toBe(false);
    expect(isV2EntityTemplateId('news-story')).toBe(true);
    expect(isV2EntityTemplateId('podcast')).toBe(true);
    expect(isV2EntityTemplateId('episode')).toBe(true);
    expect(isV2EntityTemplateId('event')).toBe(true);
  });
});
