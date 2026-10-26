import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Editor } from './lazy-editor';

const mocks = vi.hoisted(() => ({ isLoadingBlocks: true, mountEditor: vi.fn() }));

vi.mock('next/dynamic', () => ({
  default: () => () => {
    mocks.mountEditor();
    return <div data-testid="editor" />;
  },
}));
vi.mock('~/core/state/editor/editor-provider', () => ({
  useEditorInstance: () => ({ isLoadingBlocks: mocks.isLoadingBlocks }),
}));
vi.mock('~/core/state/editor/use-editor-blocks', () => ({ useEditorServerContent: vi.fn() }));
vi.mock('~/core/hooks/use-user-is-editing', () => ({ useUserIsEditing: vi.fn() }));
vi.mock('./server-content', () => ({ ServerContent: () => null }));

beforeEach(() => {
  mocks.isLoadingBlocks = true;
  mocks.mountEditor.mockClear();
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
});
