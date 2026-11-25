import { cleanup, render } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pageContext } from '~/core/action-context';

import { PageTemplateAnalytics } from './page-template-analytics';

// `flag` is what the hook reports (its default until hydration), `stored` what the browser has set.
const state = vi.hoisted(() => ({ flag: true, stored: true, editing: false }));
vi.mock('~/core/state/feature-flags', () => ({
  useFeatureFlag: () => state.flag,
  readStoredFeatureFlag: () => state.stored,
}));
vi.mock('~/core/hooks/use-user-is-editing', () => ({ useUserIsEditing: () => state.editing }));

const SPACE = '11111111111111111111111111111111';
const TOPIC = '22222222222222222222222222222222';
const PATH = `/space/${SPACE}/${TOPIC}`;

beforeEach(() => {
  state.flag = true;
  state.stored = true;
  state.editing = false;
});
afterEach(cleanup);

describe('PageTemplateAnalytics', () => {
  it('names the template as the one that drew the page when the template is shown', () => {
    render(<PageTemplateAnalytics entityId={TOPIC} spaceId={SPACE} template="topic" />);
    expect(pageContext(PATH)).toMatchObject({ page_template: 'topic', page_template_renderer: 'template' });
  });

  it('marks the legacy page with the template flag off', () => {
    state.flag = false;
    state.stored = false;
    render(<PageTemplateAnalytics entityId={TOPIC} spaceId={SPACE} template="topic" />);
    expect(pageContext(PATH)).toMatchObject({ page_template: 'topic', page_template_renderer: 'legacy' });
  });

  it('labels a first view legacy when the stored flag is off, before the hook has hydrated', () => {
    // Before hydration `useFeatureFlag` reports the default (on) for a browser that turned it off.
    state.flag = true;
    state.stored = false;
    render(<PageTemplateAnalytics entityId={TOPIC} spaceId={SPACE} template="topic" />);
    expect(pageContext(PATH)).toMatchObject({ page_template: 'topic', page_template_renderer: 'legacy' });
  });

  it('re-registers when the flag is toggled', () => {
    const view = render(<PageTemplateAnalytics entityId={TOPIC} spaceId={SPACE} template="topic" />);
    state.flag = false;
    state.stored = false;
    view.rerender(<PageTemplateAnalytics entityId={TOPIC} spaceId={SPACE} template="topic" />);
    expect(pageContext(PATH)).toMatchObject({ page_template_renderer: 'legacy' });
  });

  it('switches to the legacy page in edit mode, and back', () => {
    const view = render(<PageTemplateAnalytics entityId={TOPIC} spaceId={SPACE} template="claim" />);
    state.editing = true;
    view.rerender(<PageTemplateAnalytics entityId={TOPIC} spaceId={SPACE} template="claim" />);
    expect(pageContext(PATH)).toMatchObject({ page_template: 'claim', page_template_renderer: 'legacy' });
    state.editing = false;
    view.rerender(<PageTemplateAnalytics entityId={TOPIC} spaceId={SPACE} template="claim" />);
    expect(pageContext(PATH)).toMatchObject({ page_template_renderer: 'template' });
  });

  it('stops naming a template once the page unmounts', () => {
    const view = render(<PageTemplateAnalytics entityId={TOPIC} spaceId={SPACE} template="topic" />);
    view.unmount();
    expect(pageContext(PATH)).not.toHaveProperty('page_template');
  });
});
