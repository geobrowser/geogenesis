import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { TOPIC_TYPE_ID } from '~/core/constants';

import { entityBrowseViewFromTypes, entityPageTypeFromTypes } from './entity-browse-view';

describe('entityBrowseViewFromTypes', () => {
  it('gives Claim precedence over Topic and Person', () => {
    expect(
      entityBrowseViewFromTypes([{ id: SystemIds.PERSON_TYPE }, { id: TOPIC_TYPE_ID }, { id: CLAIM_TYPE_ID }])
    ).toBe('claim');
  });

  it('gives Topic precedence over Person', () => {
    expect(entityBrowseViewFromTypes([{ id: SystemIds.PERSON_TYPE }, { id: TOPIC_TYPE_ID }])).toBe('topic');
  });

  it('recognizes equivalent UUID formatting', () => {
    expect(entityBrowseViewFromTypes([{ id: CLAIM_TYPE_ID.replaceAll('-', '') }])).toBe('claim');
  });

  it('returns null when no custom view applies', () => {
    expect(entityBrowseViewFromTypes([{ id: SystemIds.PAGE_TYPE }])).toBeNull();
  });
});

describe('entityPageTypeFromTypes', () => {
  it('records an entity typed Claim and News event as the event page it draws', () => {
    const types = [{ id: CLAIM_TYPE_ID }, { id: ContentIds.NEWS_EVENT_TYPE }];

    expect(entityPageTypeFromTypes(types)).toBe('event');
    // Routing on the server still answers with the stable template.
    expect(entityBrowseViewFromTypes(types)).toBe('claim');
  });

  it('keeps stable page types and returns null for an untemplated entity', () => {
    expect(entityPageTypeFromTypes([{ id: CLAIM_TYPE_ID }])).toBe('claim');
    expect(entityPageTypeFromTypes([{ id: SystemIds.PAGE_TYPE }])).toBeNull();
  });
});
