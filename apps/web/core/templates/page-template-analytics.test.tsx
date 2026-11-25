import { cleanup, render } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pageContext } from '~/core/action-context';

import { PageTemplateAnalytics } from './page-template-analytics';

const state = vi.hoisted(() => ({ flag: true, editing: false }));
vi.mock('~/core/state/feature-flags', () => ({ useFeatureFlag: () => state.flag }));
vi.mock('~/core/hooks/use-user-is-editing', () => ({ useUserIsEditing: () => state.editing }));

const SPACE = '11111111111111111111111111111111';
const TOPIC = '22222222222222222222222222222222';
const PATH = `/space/${SPACE}/${TOPIC}`;

beforeEach(() => {
  state.flag = true;
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
    render(<PageTemplateAnalytics entityId={TOPIC} spaceId={SPACE} template="topic" />);
    expect(pageContext(PATH)).toMatchObject({ page_template: 'topic', page_template_renderer: 'legacy' });
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
