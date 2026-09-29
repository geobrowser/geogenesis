import { afterEach, describe, expect, it } from 'vitest';

import { enterActionContext, pageContext, snapshotActionContext, withActionContext } from './action-context';

afterEach(() => new Promise<void>(resolve => setTimeout(resolve, 0)));

const space = '11111111111111111111111111111111';
const claim = '22222222222222222222222222222222';
const debate = '33333333333333333333333333333333';

describe('action context', () => {
  it('separates a page entity from the target, including nested entity tabs', () => {
    window.history.replaceState({}, '', `/space/${space}/${claim}/debates`);
    const context = snapshotActionContext('entity_vote_buttons', 'debate', debate);
    expect(context).toMatchObject({
      page_entity_id: claim,
      page_entity_type: 'entity',
      page_type: 'entity',
      target_id: debate,
      target_type: 'debate',
    });
    expect(pageContext(`/space/${space}/activity`)).toMatchObject({
      page_entity_id: space,
      page_type: 'space_activity',
    });
  });
  it('retains the starting page, overlay and list on replay after navigation', () => {
    window.history.replaceState({}, '', '/explore');
    const original = snapshotActionContext('explore_feed_card', 'claim', claim, {
      overlay: 'entity_side_panel',
      overlay_entity_id: claim,
      item_position: 10,
      origin_entity_ids: [debate],
    });
    window.history.replaceState({}, '', `/space/${space}/${claim}`);
    const replayed = withActionContext(original, () => snapshotActionContext('entity_vote_buttons', 'claim', claim));
    expect(replayed).toEqual(original);
    expect(snapshotActionContext('entity_vote_buttons', 'claim', claim).page_path).not.toBe('/explore');
  });
  it('clears nested event contexts instead of restoring a stale outer click', async () => {
    const outer = snapshotActionContext('explore_feed_card', 'claim', claim);
    enterActionContext(outer);
    enterActionContext({ ...outer, component: 'debate_claim_ticker' });
    expect(snapshotActionContext('entity_vote_buttons', 'claim', claim).component).toBe('debate_claim_ticker');
    await Promise.resolve();
    expect(snapshotActionContext('entity_vote_buttons', 'claim', claim).component).toBe('debate_claim_ticker');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(snapshotActionContext('entity_vote_buttons', 'claim', claim).component).toBe('entity_vote_buttons');
  });
  it('shares a view id for rerenders and gives a return visit a new id', () => {
    const first = pageContext('/explore').page_view_id;
    expect(pageContext('/explore').page_view_id).toBe(first);
    pageContext('/debates');
    expect(pageContext('/explore').page_view_id).not.toBe(first);
  });
});

it('copies origin IDs and drops unreviewed text from a description', () => {
  const sources = ['debate'];
  const context = snapshotActionContext('entity_vote_buttons', 'claim', 'claim', {
    origin_entity_ids: sources,
    email: 'private@example.com',
    comment: 'private',
  } as never);
  sources.push('another');
  expect(context.origin_entity_ids).toEqual(['debate']);
  expect(context).not.toHaveProperty('email');
  expect(context).not.toHaveProperty('comment');
});

it('never assigns a different target the parent entity type IDs or sources', () => {
  const context = snapshotActionContext('entity_vote_buttons', 'claim', claim, {
    target_id: debate,
    target_type_ids: ['debate-type'],
    origin_entity_ids: ['parent-source'],
  });
  expect(context).not.toHaveProperty('target_type_ids');
  expect(context).not.toHaveProperty('origin_entity_ids');
});

it('retains metadata when graph IDs differ only in UUID formatting', () => {
  const id = '4c81561d-1f95-4131-9cdd-dd20ab831ba2';
  const context = snapshotActionContext('entity_vote_buttons', 'claim', id.replaceAll('-', ''), {
    target_id: id,
    target_type_ids: ['claim-type'],
    origin_entity_ids: [debate],
  });
  expect(context.target_type_ids).toEqual(['claim-type']);
  expect(context.origin_entity_ids).toEqual([debate]);
});
