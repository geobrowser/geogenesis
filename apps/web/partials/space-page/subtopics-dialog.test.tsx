import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ROOT_SPACE } from '~/core/constants';

import { SubtopicsDialog } from './subtopics-dialog';

const AI_SPACE = '41e851610e13a19441c4d980f2f2ce6b';
const AI_TOPIC = '8cb0a2b4adbf4627aa080cec5112099a';

const mocks = vi.hoisted(() => ({
  treeProps: [] as Array<Record<string, unknown>>,
  searchProps: [] as Array<Record<string, unknown>>,
}));

vi.mock('~/core/hooks/use-space', () => ({
  useSpace: () => ({ space: { id: AI_SPACE, topicId: AI_TOPIC, entity: { id: AI_TOPIC } }, isLoading: false }),
}));
vi.mock('~/core/state/entity-page-store/entity-store', () => ({
  useName: (_entityId: string, spaceId?: string) => (spaceId === AI_SPACE ? 'AI' : null),
}));
vi.mock('~/partials/space-page/subtopics-dialog-shell', () => ({
  SubtopicsDialogShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('~/partials/space-page/subtopics-tree-view', () => ({
  SubtopicsTreeView: (props: Record<string, unknown> & { onAddSubtopic: (target: unknown) => void }) => {
    mocks.treeProps.push(props);
    return (
      <button type="button" onClick={() => props.onAddSubtopic({ parentEntityId: AI_TOPIC, parentName: 'AI' })}>
        add
      </button>
    );
  },
}));
vi.mock('~/partials/space-page/add-subtopic-search-view', () => ({
  AddSubtopicSearchView: (props: Record<string, unknown>) => {
    mocks.searchProps.push(props);
    return <div data-testid="search" />;
  },
}));

afterEach(() => {
  cleanup();
  mocks.treeProps.length = 0;
  mocks.searchProps.length = 0;
});

describe('SubtopicsDialog', () => {
  it("reads the tree from the root space, rooted at the current space's topic", () => {
    render(<SubtopicsDialog open onOpenChange={() => {}} spaceId={AI_SPACE} />);

    expect(mocks.treeProps.at(-1)).toMatchObject({
      spaceId: ROOT_SPACE,
      rootEntityId: AI_TOPIC,
      // Named and linked from the space the reader is in, not the root.
      rootName: 'AI',
      linkSpaceId: AI_SPACE,
    });
  });

  it('proposes new subtopics in the root space, where the tree reads them from', () => {
    render(<SubtopicsDialog open onOpenChange={() => {}} spaceId={AI_SPACE} />);

    fireEvent.click(screen.getByRole('button', { name: 'add' }));

    expect(screen.getByTestId('search')).toBeInTheDocument();
    expect(mocks.searchProps.at(-1)).toMatchObject({ spaceId: ROOT_SPACE });
  });
});
