'use client';

import * as React from 'react';

import cx from 'classnames';

import { useAccessControl } from '~/core/hooks/use-access-control';
import { usePendingSubtopicProposals } from '~/core/hooks/use-pending-subtopic-proposals';
import { useProposeSubtopicRelation } from '~/core/hooks/use-propose-subtopic-relation';
import { usePrefetchSubtopicChildren, useSubtopicChildren } from '~/core/hooks/use-subtopic-children';
import { usePrefetchDefaultSubtopics } from '~/core/hooks/use-subtopic-search';
import type { PendingSubtopicProposal } from '~/core/io/subgraph/fetch-pending-subtopic-proposals';
import type { SubtopicChild } from '~/core/io/subgraph/fetch-subtopic-children';
import { useName } from '~/core/state/entity-page-store/entity-store';
import { NavUtils } from '~/core/utils/utils';

import { Dots } from '~/design-system/dots';
import { ChevronRight } from '~/design-system/icons/chevron-right';
import { Close } from '~/design-system/icons/close';
import { Context } from '~/design-system/icons/context';
import { Menu, MenuItem } from '~/design-system/menu';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

import type { AddSubtopicTarget } from '~/partials/space-page/add-subtopic-search-view';

// Warm only the first N children's grandchildren on expand. A node can have up to
// MAX_SUBTOPIC_CHILDREN (500) children; prefetching every one would fan out into
// hundreds of requests and saturate the client. The rest fetch on demand when expanded.
const PREFETCH_CHILDREN_LIMIT = 10;

interface SubtopicsTreeViewProps {
  spaceId: string;
  rootEntityId: string;
  onAddSubtopic: (target: AddSubtopicTarget) => void;
  onNavigate?: () => void;
}

export function SubtopicsTreeView({ spaceId, rootEntityId, onAddSubtopic, onNavigate }: SubtopicsTreeViewProps) {
  const { isEditor, isMember } = useAccessControl(spaceId);
  const canEdit = isEditor || isMember;
  const rootName = useName(rootEntityId, spaceId);
  const prefetchDefaultSubtopics = usePrefetchDefaultSubtopics();

  // Warm the "add a subtopic" suggestions while the user browses the tree so the
  // search dropdown is already populated the first time they open it.
  React.useEffect(() => {
    if (canEdit) prefetchDefaultSubtopics();
  }, [canEdit, prefetchDefaultSubtopics]);
  const { data: pendingProposals = [], isLoading: isPendingLoading } = usePendingSubtopicProposals(
    spaceId,
    rootEntityId,
    true
  );

  const adds = pendingProposals.filter(proposal => proposal.direction === 'add');
  const removals = pendingProposals.filter(proposal => proposal.direction === 'remove');

  return (
    <>
      {isPendingLoading && (
        <div className="flex h-10 items-center justify-center">
          <Dots />
        </div>
      )}

      {!isPendingLoading && adds.length > 0 && (
        <PendingSubtopicProposalsSection
          title="Proposed subtopics to add"
          proposals={adds}
          spaceId={spaceId}
          onNavigate={onNavigate}
        />
      )}

      {!isPendingLoading && removals.length > 0 && (
        <PendingSubtopicProposalsSection
          title="Proposed subtopics to remove"
          proposals={removals}
          spaceId={spaceId}
          onNavigate={onNavigate}
        />
      )}

      <div className="flex flex-col gap-2">
        <Text variant="metadata" as="p">
          Current
        </Text>

        <SubtopicTreeNode
          entityId={rootEntityId}
          name={rootName ?? 'Untitled'}
          spaceId={spaceId}
          rootEntityId={rootEntityId}
          depth={0}
          canEdit={canEdit}
          isRoot
          defaultExpanded
          onAddSubtopic={onAddSubtopic}
          onNavigate={onNavigate}
        />
      </div>
    </>
  );
}

function PendingSubtopicProposalsSection({
  title,
  proposals,
  spaceId,
  onNavigate,
}: {
  title: string;
  proposals: PendingSubtopicProposal[];
  spaceId: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Text variant="metadata" as="p">
        {title}
      </Text>
      <div className="flex flex-col gap-2">
        {proposals.map(proposal => (
          <PendingSubtopicProposalCard
            key={`${proposal.proposalId}-${proposal.parentEntityId}-${proposal.childEntityId}`}
            proposal={proposal}
            spaceId={spaceId}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  );
}

function PendingSubtopicProposalCard({
  proposal,
  spaceId,
  onNavigate,
}: {
  proposal: PendingSubtopicProposal;
  spaceId: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-grey-02 px-3 py-3">
      <div className="min-w-0 flex-1">
        {proposal.path && <p className="truncate text-footnote text-grey-04">{proposal.path}</p>}
        <p className="mt-1 text-button font-medium text-text">{proposal.name}</p>
      </div>
      <Link
        href={NavUtils.toProposal(spaceId, proposal.proposalId)}
        onClick={() => onNavigate?.()}
        className="shrink-0 rounded-[6px] border border-grey-02 bg-white px-[7px] py-1 text-metadata text-text shadow-light transition hover:border-text"
      >
        View
      </Link>
    </div>
  );
}

function SubtopicTreeNode({
  entityId,
  name,
  spaceId,
  rootEntityId,
  depth,
  canEdit,
  isRoot = false,
  parentEntityId,
  parentName,
  relationId,
  defaultExpanded = false,
  onAddSubtopic,
  onNavigate,
}: {
  entityId: string;
  name: string;
  spaceId: string;
  rootEntityId: string;
  depth: number;
  canEdit: boolean;
  isRoot?: boolean;
  parentEntityId?: string;
  parentName?: string | null;
  relationId?: string;
  defaultExpanded?: boolean;
  onAddSubtopic: (target: AddSubtopicTarget) => void;
  onNavigate?: () => void;
}) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const { data: children = [], isLoading, isError } = useSubtopicChildren(entityId, spaceId, expanded);
  const { proposeRemove, isPending, isPersonalSpace } = useProposeSubtopicRelation(spaceId);
  const prefetchChildren = usePrefetchSubtopicChildren();

  const addLabel = isPersonalSpace ? 'Add subtopic' : 'Propose subtopic';
  const removeLabel = isPersonalSpace ? 'Remove subtopic' : 'Propose removal';

  React.useEffect(() => {
    if (!expanded) return;
    for (const child of children.slice(0, PREFETCH_CHILDREN_LIMIT)) {
      prefetchChildren(child.id, spaceId);
    }
  }, [expanded, children, spaceId, prefetchChildren]);

  const openAddSearch = () => {
    setMenuOpen(false);
    onAddSubtopic({
      parentEntityId: entityId,
      parentName: name,
    });
  };

  const handleProposeRemoval = async () => {
    if (!parentEntityId || !relationId || isPending) return;

    setMenuOpen(false);
    await proposeRemove({
      parentEntityId,
      parentName: parentName ?? null,
      childEntityId: entityId,
      childName: name,
      relationId,
    });
  };

  return (
    <div className="flex flex-col">
      <div
        className={cx(
          'flex min-h-8 items-center gap-1 transition-colors',
          expanded ? 'text-text' : 'text-grey-04 hover:text-text'
        )}
        style={{ paddingLeft: depth * 16 }}
      >
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse subtopics' : 'Expand subtopics'}
          onClick={() => setExpanded(current => !current)}
          className="flex size-6 shrink-0 items-center justify-center rounded text-current"
        >
          <span className={cx('inline-flex transition-transform', expanded ? 'rotate-90' : '')}>
            <ChevronRight />
          </span>
        </button>

        <Link
          href={NavUtils.toEntity(spaceId, entityId)}
          onClick={() => onNavigate?.()}
          className="min-w-0 flex-1 truncate text-button text-current hover:underline"
        >
          {name}
        </Link>

        {canEdit && (
          <Menu
            open={menuOpen}
            onOpenChange={setMenuOpen}
            asChild
            trigger={
              <button
                type="button"
                aria-label="Subtopic actions"
                className="flex size-6 shrink-0 items-center justify-center rounded text-grey-04 transition hover:text-text"
              >
                {menuOpen ? <Close color="grey-04" /> : <Context color="grey-04" />}
              </button>
            }
            className="min-w-[200px]"
          >
            <MenuItem onClick={openAddSearch}>
              <span>{addLabel}</span>
            </MenuItem>
            {!isRoot && parentEntityId && relationId && (
              <MenuItem onClick={() => void handleProposeRemoval()}>
                <span>{removeLabel}</span>
              </MenuItem>
            )}
          </Menu>
        )}
      </div>

      {expanded && (
        <div className="flex flex-col">
          {isLoading && (
            <div className="flex h-10 items-center justify-center" style={{ paddingLeft: (depth + 1) * 16 + 24 }}>
              <Dots />
            </div>
          )}

          {!isLoading && isError && (
            <p className="py-2 text-button text-grey-04" style={{ paddingLeft: (depth + 1) * 16 + 24 }}>
              Unable to load subtopics
            </p>
          )}

          {!isLoading &&
            !isError &&
            children.map((child: SubtopicChild) => (
              <SubtopicTreeNode
                key={child.id}
                entityId={child.id}
                name={child.name}
                spaceId={spaceId}
                rootEntityId={rootEntityId}
                depth={depth + 1}
                canEdit={canEdit}
                parentEntityId={entityId}
                parentName={name}
                relationId={child.relationId}
                onAddSubtopic={onAddSubtopic}
                onNavigate={onNavigate}
              />
            ))}
        </div>
      )}
    </div>
  );
}
