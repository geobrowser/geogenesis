import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { EditableCoverAvatarHeader } from './editable-entity-cover-avatar-header';

vi.mock('~/core/hooks/use-renderables', () => ({ useEditableProperties: () => ({}) }));
vi.mock('~/core/hooks/use-user-is-editing', () => ({ useUserIsEditing: () => false }));
vi.mock('~/core/state/entity-page-store/entity-store-provider', () => ({
  useEntityStoreInstance: () => ({ id: 'entity-1', spaceId: 'space-1' }),
}));
vi.mock('~/core/sync/use-mutate', () => ({ useMutate: () => ({ storage: {} }) }));
vi.mock('~/core/sync/use-store', () => ({ useRelation: () => null }));

vi.mock('~/design-system/geo-image', () => ({
  GeoImage: ({ className }: { className?: string }) => (
    <img data-testid="standard-cover" alt="" className={className} />
  ),
  NativeGeoImage: ({ className }: { className?: string }) => (
    <img data-testid="compact-cover" alt="" className={className} />
  ),
}));

afterEach(cleanup);

describe('EditableCoverAvatarHeader compact cover', () => {
  it('crops the side-panel cover to the mobile cover height', () => {
    render(<EditableCoverAvatarHeader avatarUrl={null} coverUrl="https://example.com/cover.jpg" compact />);

    expect(screen.getByTestId('compact-cover')).toHaveClass('h-[180px]', 'w-full', 'object-cover');
    expect(screen.queryByTestId('standard-cover')).toBeNull();
  });
});
