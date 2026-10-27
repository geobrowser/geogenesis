import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Editor } from './lazy-editor';

const mocks = vi.hoisted(() => ({
  isLoadingBlocks: true,
  id: 'entity-1',
  spaceId: 'space',
  activeTabId: null as string | null,
  mountEditor: vi.fn(),
  unmountEditor: vi.fn(),
}));

vi.mock('next/dynamic', () => ({
  default: () => () => {
    const [draft, setDraft] = React.useState('');
    React.useEffect(() => {
      mocks.mountEditor();
      return () => mocks.unmountEditor();
    }, []);
    return (
      <div data-testid="editor">
        <input aria-label="Editor text" value={draft} onChange={event => setDraft(event.target.value)} />
      </div>
    );
  },
}));
vi.mock('~/core/state/editor/editor-provider', () => ({
  useEditorInstance: () => ({ id: mocks.id, spaceId: mocks.spaceId, isLoadingBlocks: mocks.isLoadingBlocks }),
  useActiveTabIdForEditor: () => mocks.activeTabId,
}));
vi.mock('~/core/state/editor/use-editor-blocks', () => ({ useEditorServerContent: vi.fn() }));
vi.mock('~/core/hooks/use-user-is-editing', () => ({ useUserIsEditing: vi.fn() }));
vi.mock('./server-content', () => ({ ServerContent: () => null }));

beforeEach(() => {
  mocks.isLoadingBlocks = true;
  mocks.id = 'entity-1';
  mocks.spaceId = 'space';
  mocks.activeTabId = null;
  mocks.mountEditor.mockClear();
  mocks.unmountEditor.mockClear();
});
afterEach(cleanup);

describe('side panel block loading', () => {
  it('shows a local placeholder without mounting the editor with incomplete content', () => {
    render(<Editor spaceId="space" />);

    expect(screen.getByRole('status', { name: 'Loading content' })).toBeInTheDocument();
    expect(mocks.mountEditor).not.toHaveBeenCalled();
  });

  it('mounts the editor once the blocks arrive', () => {
    const { rerender } = render(<Editor spaceId="space" />);
    mocks.isLoadingBlocks = false;
    rerender(<Editor spaceId="space" />);

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByTestId('editor')).toBeInTheDocument();
  });

  it.each([
    { label: 'overview', tabId: null },
    { label: 'authored tab', tabId: 'tab-1' },
  ])('keeps the initialized $label editor mounted during later block reads', ({ tabId }) => {
    mocks.activeTabId = tabId;
    const { rerender } = render(<Editor spaceId="space" />);
    mocks.isLoadingBlocks = false;
    rerender(<Editor spaceId="space" />);

    const editor = screen.getByTestId('editor');
    const input = screen.getByRole('textbox', { name: 'Editor text' });
    fireEvent.change(input, { target: { value: 'Uncommitted draft' } });
    input.focus();

    // Adding blocks or changing the set of tabs can start another query for this same document.
    mocks.isLoadingBlocks = true;
    rerender(<Editor spaceId="space" />);

    expect(screen.queryByRole('status', { name: 'Loading content' })).not.toBeInTheDocument();
    expect(screen.getByTestId('editor')).toBe(editor);
    expect(input).toHaveValue('Uncommitted draft');
    expect(input).toHaveFocus();
    expect(mocks.mountEditor).toHaveBeenCalledTimes(1);
    expect(mocks.unmountEditor).not.toHaveBeenCalled();
  });

  it.each(['entity', 'space', 'tab'] as const)('waits for initial blocks again when the %s changes', scope => {
    mocks.isLoadingBlocks = false;
    const { rerender } = render(<Editor spaceId={mocks.spaceId} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Previous document' } });

    if (scope === 'entity') mocks.id = 'entity-2';
    if (scope === 'space') mocks.spaceId = 'space-2';
    if (scope === 'tab') mocks.activeTabId = 'tab-1';
    mocks.isLoadingBlocks = true;
    rerender(<Editor spaceId={mocks.spaceId} />);

    expect(screen.getByRole('status', { name: 'Loading content' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    mocks.isLoadingBlocks = false;
    rerender(<Editor spaceId={mocks.spaceId} />);
    expect(screen.getByRole('textbox')).toHaveValue('');
  });
});
