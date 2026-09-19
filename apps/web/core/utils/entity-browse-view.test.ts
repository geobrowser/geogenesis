import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { TOPIC_TYPE_ID } from '~/core/constants';

import { entityBrowseViewFromTypes } from './entity-browse-view';

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
