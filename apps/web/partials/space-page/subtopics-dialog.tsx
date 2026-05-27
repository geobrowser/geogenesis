'use client';

import { Content, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import * as React from 'react';

import cx from 'classnames';
import { motion } from 'framer-motion';
import pluralize from 'pluralize';

import { useAccessControl } from '~/core/hooks/use-access-control';
import { useSubtopicChildren } from '~/core/hooks/use-subtopic-children';
import { useSpace } from '~/core/hooks/use-space';
import { useName } from '~/core/state/entity-page-store/entity-store';
import { Spaces } from '~/core/utils/space';

import { SquareButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { ChevronRight } from '~/design-system/icons/chevron-right';
import { Close } from '~/design-system/icons/close';
import { Context } from '~/design-system/icons/context';
import { Menu, MenuItem } from '~/design-system/menu';
import { Text } from '~/design-system/text';

interface SubtopicsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
}

export function SubtopicsDialog({ open, onOpenChange, spaceId }: SubtopicsDialogProps) {
  const { space, isLoading } = useSpace(spaceId);

  if (!open || isLoading || !space) return null;

  const rootEntityId = Spaces.getSpaceSubtopicRootEntityId(space);

  return (
    <SubtopicsDialogShell open={open} onOpenChange={onOpenChange}>
      <SubtopicsTree spaceId={spaceId} rootEntityId={rootEntityId} />
    </SubtopicsDialogShell>
  );
}

function SubtopicsDialogShell({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Portal>
        <Overlay className="fixed inset-0 z-100 bg-text/20" />

        <Content className="fixed inset-0 z-100 flex items-start justify-center focus:outline-hidden">
          <div className="mt-32 flex w-[460px] flex-col overflow-visible rounded-xl bg-white px-4 pt-4 shadow-lg">
            <div className="flex items-start justify-between border-b border-divider pb-4">
              <Title asChild>
                <Text variant="smallTitle" as="h2">
                  Subtopics
                </Text>
              </Title>
              <SquareButton onClick={() => onOpenChange(false)} icon={<Close />} />
            </div>

            <div className="flex flex-col gap-3 py-4">{children}</div>
          </div>
        </Content>
      </Portal>
    </Root>
  );
}

function SubtopicsTree({ spaceId, rootEntityId }: { spaceId: string; rootEntityId: string }) {
  const { isEditor, isMember } = useAccessControl(spaceId);
  const canEdit = isEditor || isMember;
  const rootName = useName(rootEntityId, spaceId);

  return (
    <div className="flex flex-col gap-2">
      <Text variant="metadata" as="p">
        Current
      </Text>

      <SubtopicTreeNode
        entityId={rootEntityId}
        name={rootName ?? 'Untitled'}
        spaceId={spaceId}
        depth={0}
        canEdit={canEdit}
        defaultExpanded
      />
    </div>
  );
}

function SubtopicTreeNode({
  entityId,
  name,
  spaceId,
  depth,
  canEdit,
  defaultExpanded = false,
}: {
  entityId: string;
  name: string;
  spaceId: string;
  depth: number;
  canEdit: boolean;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const { data: children = [], isLoading, isError } = useSubtopicChildren(entityId, spaceId, expanded);

  const toggleExpanded = () => {
    setExpanded(current => !current);
  };

  return (
    <div className="flex flex-col">
      <div
        className="flex min-h-8 items-center gap-1"
        style={{ paddingLeft: depth * 16 }}
      >
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse subtopics' : 'Expand subtopics'}
          onClick={toggleExpanded}
          className="flex size-6 shrink-0 items-center justify-center rounded text-grey-04 transition hover:text-text"
        >
          <span className={cx('inline-flex transition-transform', expanded ? 'rotate-90' : '')}>
            <ChevronRight />
          </span>
        </button>

        <span className="min-w-0 flex-1 truncate text-button text-text">{name}</span>

        {canEdit && (
          <Menu
            open={menuOpen}
            onOpenChange={setMenuOpen}
            trigger={
              <button
                type="button"
                aria-label="Subtopic actions"
                className="flex size-6 shrink-0 items-center justify-center rounded text-grey-04 transition hover:text-text"
              >
                <Context color="grey-04" />
              </button>
            }
            className="min-w-[180px]"
          >
            <p className="px-3 py-2 text-button text-grey-04">Add or remove subtopics (coming soon)</p>
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
            children.map(child => (
              <SubtopicTreeNode
                key={child.id}
                entityId={child.id}
                name={child.name}
                spaceId={spaceId}
                depth={depth + 1}
                canEdit={canEdit}
              />
            ))}
        </div>
      )}
    </div>
  );
}
