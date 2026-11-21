import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { NEWS_STORY_TYPE_ID, TOPIC_TYPE_ID } from '~/core/constants';
import {
  ARTICLE_TYPE_ID,
  DATASET_TYPE_ID,
  OFFICIAL_DOCUMENT_TYPE_ID,
  PAPER_TYPE_ID,
  POST_TYPE_ID,
  TWEET_TYPE_ID,
} from '~/core/topics/ontology';

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
    expect(resolveEntityTemplateFromTypes([{ id: NEWS_STORY_TYPE_ID }])).toBeNull();
    expect(resolveEntityTemplateFromTypes([{ id: OFFICIAL_DOCUMENT_TYPE_ID }])).toBeNull();
    expect(resolveEntityTemplateFromTypes([{ id: TWEET_TYPE_ID }])).toBeNull();

    expect(resolveEntityTemplateFromTypes([{ id: NEWS_STORY_TYPE_ID }], { includeV2: true })?.id).toBe('news-story');
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

  it('matches dashed and undashed UUID forms', () => {
    const dashedNews = `${NEWS_STORY_TYPE_ID.slice(0, 8)}-${NEWS_STORY_TYPE_ID.slice(8, 12)}-${NEWS_STORY_TYPE_ID.slice(12, 16)}-${NEWS_STORY_TYPE_ID.slice(16, 20)}-${NEWS_STORY_TYPE_ID.slice(20)}`;
    expect(resolveEntityTemplateFromTypes([{ id: dashedNews }], { includeV2: true })?.id).toBe('news-story');
  });

  it('exposes consistent metadata for every registered template', () => {
    expect(ENTITY_TEMPLATE_REGISTRY.map(entry => entry.id)).toEqual([
      'claim',
      'topic',
      'event',
      'news-story',
      'source',
      'post',
      'person',
    ]);
    expect(getEntityTemplateDefinition('claim').keepInEditMode).toBe(true);
    expect(getEntityTemplateDefinition('topic').keepInEditMode).toBe(true);
    expect(getEntityTemplateDefinition('person').requiresSpaceCheck).toBe(true);
    expect(isV2EntityTemplateId('claim')).toBe(false);
    expect(isV2EntityTemplateId('news-story')).toBe(true);
    expect(isV2EntityTemplateId('event')).toBe(true);
  });
});
