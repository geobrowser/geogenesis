'use client';

import { Content, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import * as React from 'react';

import { motion } from 'framer-motion';

import type { ActiveSubspace } from '~/core/io/subgraph/fetch-active-subspaces';

import { SquareButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { NativeGeoImage } from '~/design-system/geo-image';
import { Close } from '~/design-system/icons/close';
import { Input } from '~/design-system/input';
import { ResizableContainer } from '~/design-system/resizable-container';
import { Text } from '~/design-system/text';
import { Truncate } from '~/design-system/truncate';

// ============================================================================
// Types
// ============================================================================

export type RelationType = 'related' | 'verified';
export type PendingAction = 'adding' | 'removing';

export interface SpaceSearchResult {
  id: string;
  name: string | null;
  description: string | null;
  image: string;
}

// ============================================================================
// Dialog Shell
// ============================================================================

interface SubspacesDialogShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function SubspacesDialogShell({ open, onOpenChange, children }: SubspacesDialogShellProps) {
  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Portal>
        <Overlay className="fixed inset-0 z-100 bg-text/20" />

        <Content className="fixed inset-0 z-100 flex items-start justify-center focus:outline-hidden">
          <div className="mt-32 flex w-[460px] flex-col gap-4 rounded-xl bg-white px-4 pt-4 shadow-lg">
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <Title asChild>
                  <Text variant="smallTitle" as="h2">
                    Space relationships
                  </Text>
                </Title>
                <SquareButton onClick={() => onOpenChange(false)} icon={<Close />} />
              </div>
              {children}
            </div>
          </div>
        </Content>
      </Portal>
    </Root>
  );
}

// ============================================================================
// Relation Type Toggle
// ============================================================================

interface RelationTypeToggleProps {
  value: RelationType;
  onChange: (value: RelationType) => void;
  disabled?: boolean;
}

export function RelationTypeToggle({ value, onChange, disabled = false }: RelationTypeToggleProps) {
  return (
    <div className={`relative flex overflow-hidden rounded-sm border border-grey-02 ${disabled ? 'opacity-50' : ''}`}>
      <button
        type="button"
        disabled={disabled}
        className={`relative z-10 px-2 py-0.5 text-tag transition-colors ${
          value === 'related' ? 'text-white' : 'text-grey-04 hover:bg-grey-01'
        }`}
        onClick={() => onChange('related')}
      >
        {value === 'related' && (
          <motion.span
            layoutId="subspace-type-indicator"
            className="absolute inset-0 bg-text"
            transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }}
          />
        )}
        <span className="relative z-10">Related</span>
      </button>
      <button
        type="button"
        disabled={disabled}
        className={`relative z-10 px-2 py-0.5 text-tag transition-colors ${
          value === 'verified' ? 'text-white' : 'text-grey-04 hover:bg-grey-01'
        }`}
        onClick={() => onChange('verified')}
      >
        {value === 'verified' && (
          <motion.span
            layoutId="subspace-type-indicator"
            className="absolute inset-0 bg-text"
            transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }}
          />
        )}
        <span className="relative z-10">Verified</span>
      </button>
    </div>
  );
}

// ============================================================================
// Space Search Dropdown
// ============================================================================

interface SpaceSearchDropdownProps {
  query: string;
  onQueryChange: (query: string) => void;
  results: SpaceSearchResult[];
  isSearchLoading: boolean;
  pendingKeys: Map<string, PendingAction>;
  addRelationType: RelationType;
  /** Label for the add button, e.g. "Add subspace" or "Propose subspace" */
  addButtonLabel: string;
  onAdd: (space: SpaceSearchResult) => void;
}

export function SpaceSearchDropdown({
  query,
  onQueryChange,
  results,
  isSearchLoading,
  pendingKeys,
  addRelationType,
  addButtonLabel,
  onAdd,
}: SpaceSearchDropdownProps) {
  return (
    <div className="relative">
      <Input
        withSearchIcon
        placeholder="Search spaces..."
        value={query}
        onChange={e => onQueryChange(e.target.value)}
      />
      {query && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg">
          <ResizableContainer duration={0.15}>
            <div className="max-h-[240px] overflow-y-auto">
              {isSearchLoading && (
                <div className="flex h-12 items-center justify-center">
                  <Dots />
                </div>
              )}
              {!isSearchLoading && query && results.length === 0 && (
                <div className="px-3 py-2 text-button text-grey-04">No spaces found</div>
              )}
              {!isSearchLoading &&
                results.map((result, i) => (
                  <motion.div
                    key={result.id}
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.02 * i }}
                  >
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <div className="flex min-w-0 flex-1 items-start gap-2.5">
                        <div className="mt-0.5 size-[22px] shrink-0 overflow-clip rounded-sm">
                          <NativeGeoImage
                            value={result.image}
                            alt=""
                            width={22}
                            height={22}
                            className="h-[22px] w-[22px] object-cover"
                          />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="text-button text-text">{result.name ?? 'Untitled'}</span>
                          {result.description && (
                            <Truncate maxLines={2} shouldTruncate variant="footnote">
                              <Text variant="footnote" color="grey-04">
                                {result.description}
                              </Text>
                            </Truncate>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={pendingKeys.has(`${result.id}:${addRelationType}`)}
                        className="ml-2 h-6 shrink-0 rounded-md border border-grey-02 px-[7px] text-metadata text-text disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => onAdd(result)}
                      >
                        {addButtonLabel}
                      </button>
                    </div>
                  </motion.div>
                ))}
            </div>
          </ResizableContainer>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Active Subspace Row
// ============================================================================

export type SubspaceDialogVariant = 'personal' | 'dao';

const VARIANT_LABELS = {
  personal: { adding: 'Adding...', action: 'Remove', removing: 'Removing...' },
  dao: { adding: 'Proposing...', action: 'Propose removal', removing: 'Proposing...' },
} as const;

interface ActiveSubspaceRowProps {
  subspace: ActiveSubspace;
  pendingState: PendingAction | undefined;
  variant: SubspaceDialogVariant;
  onAction: (subspaceId: string, relationType: RelationType) => void;
}

export function ActiveSubspaceRow({ subspace, pendingState, variant, onAction }: ActiveSubspaceRowProps) {
  const labels = VARIANT_LABELS[variant];
  return (
    <div>
      <div className="h-px w-full bg-divider" />
      <div className={`flex flex-col gap-1 py-3 ${pendingState ? 'opacity-60' : ''}`}>
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="size-[22px] shrink-0 overflow-clip rounded-sm">
              <NativeGeoImage
                value={subspace.image}
                alt=""
                width={22}
                height={22}
                className="h-[22px] w-[22px] object-cover"
              />
            </div>
            <Text variant="button" as="p">
              {subspace.name}
            </Text>
            <span className="rounded-sm bg-grey-01 px-1 py-0.5 text-tag text-grey-04">
              {subspace.relationType === 'verified' ? 'Verified' : 'Related'}
            </span>
          </div>
          {pendingState === 'adding' ? (
            <span className="h-6 shrink-0 px-[7px] text-metadata text-grey-04">{labels.adding}</span>
          ) : (
            <button
              type="button"
              className="h-6 shrink-0 rounded-md border border-grey-02 px-[7px] text-metadata text-text disabled:cursor-not-allowed disabled:opacity-50"
              disabled={pendingState === 'removing'}
              onClick={() => onAction(subspace.id, subspace.relationType)}
            >
              {pendingState === 'removing' ? labels.removing : labels.action}
            </button>
          )}
        </div>
        {subspace.description && (
          <Truncate maxLines={2} shouldTruncate variant="footnote">
            <Text variant="footnote" color="grey-04">
              {subspace.description}
            </Text>
          </Truncate>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Active Subspaces List
// ============================================================================

interface ActiveSubspacesListProps {
  subspaces: ActiveSubspace[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  pendingKeys: Map<string, PendingAction>;
  variant: SubspaceDialogVariant;
  onAction: (subspaceId: string, relationType: RelationType) => void;
}

export function ActiveSubspacesList({
  subspaces,
  isLoading,
  isError,
  error,
  pendingKeys,
  variant,
  onAction,
}: ActiveSubspacesListProps) {
  return (
    <div className="flex flex-col gap-2 pb-4">
      <Text variant="metadata" as="p">
        Current active spaces
      </Text>

      {isLoading && (
        <div className="flex h-12 items-center justify-center">
          <Dots />
        </div>
      )}

      {!isLoading && isError && (
        <div className="px-3 py-2 text-button text-grey-04">
          {error instanceof Error ? error.message : 'Unable to load active subspaces'}
        </div>
      )}

      {!isLoading && !isError && subspaces.length === 0 && (
        <div className="px-3 py-2 text-button text-grey-04">No active spaces declared yet</div>
      )}

      {!isLoading &&
        !isError &&
        subspaces.map(subspace => {
          const key = `${subspace.id}:${subspace.relationType}`;
          return (
            <ActiveSubspaceRow
              key={key}
              subspace={subspace}
              pendingState={pendingKeys.get(key)}
              variant={variant}
              onAction={onAction}
            />
          );
        })}
    </div>
  );
}

// ============================================================================
// Utilities
// ============================================================================

export function sortSubspaces(subspaces: ActiveSubspace[]) {
  return [...subspaces].sort((a, b) => {
    if (a.name === b.name) {
      return a.relationType.localeCompare(b.relationType);
    }
    return a.name.localeCompare(b.name);
  });
}
