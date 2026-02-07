'use client';

import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk';
import cx from 'classnames';
import { Effect } from 'effect';
import { RemoveScroll } from 'react-remove-scroll';

import * as React from 'react';

import { useLocalChanges } from '~/core/hooks/use-local-changes';
import { usePublish } from '~/core/hooks/use-publish';
import type { Space } from '~/core/io/dto/spaces';
import { getSpaces } from '~/core/io/queries';
import { useDiff } from '~/core/state/diff-store';
import { useStatusBar } from '~/core/state/status-bar-store';
import { useRelations, useValues } from '~/core/sync/use-store';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import type {
  BlockChange,
  DiffChunk,
  EntityDiff,
  RelationChange,
  TextValueChange,
  ValueChange,
} from '~/core/utils/diff/types';
import { Publish } from '~/core/utils/publish';
import { useEntityAvatarUrl, useImageUrlFromEntity } from '~/core/utils/use-entity-media';

import { Button, SmallButton, SquareButton } from '~/design-system/button';
import { Dropdown } from '~/design-system/dropdown';
import { NativeGeoImage } from '~/design-system/geo-image';
import { Close } from '~/design-system/icons/close';
import { Pending } from '~/design-system/pending';
import { Skeleton } from '~/design-system/skeleton';
import { SlideUp } from '~/design-system/slide-up';
import { Text } from '~/design-system/text';

const TYPES_PROPERTY_ID = SystemIds.TYPES_PROPERTY;
const AVATAR_PROPERTY_ID = ContentIds.AVATAR_PROPERTY;
const COVER_PROPERTY_ID = SystemIds.COVER_PROPERTY;
const NAME_PROPERTY_ID = SystemIds.NAME_PROPERTY;

type Proposals = Record<string, { name: string; description: string }>;

export const ReviewChanges = () => {
  const { isReviewOpen, setIsReviewOpen } = useDiff();
  const { state: statusBarState } = useStatusBar();
  const { makeProposal } = usePublish();
  const { store } = useSyncEngine();

  const [proposals, setProposals] = React.useState<Proposals>({});
  const [isPublishing, setIsPublishing] = React.useState(false);
  const [spaces, setSpaces] = React.useState<Space[]>([]);

  const valuesWithChanges = useValues({
    selector: t => t.hasBeenPublished === false && t.isLocal === true,
    includeDeleted: true,
  });

  const relationsWithChanges = useRelations({
    selector: r => r.hasBeenPublished === false && r.isLocal === true,
    includeDeleted: true,
  });

  const dedupedSpacesWithActions = React.useMemo(() => {
    const valueSpaceIds = valuesWithChanges.map(t => t.spaceId);
    const relationSpaceIds = relationsWithChanges.map(r => r.spaceId);

    return [...new Set([...valueSpaceIds, ...relationSpaceIds])];
  }, [valuesWithChanges, relationsWithChanges]);

  const spacesKey = dedupedSpacesWithActions.sort().join(',');
  const [activeSpace, setActiveSpace] = React.useState<string>('');

  React.useEffect(() => {
    if (activeSpace === '' && dedupedSpacesWithActions[0]) {
      setActiveSpace(dedupedSpacesWithActions[0]);
    }
  }, [spacesKey, activeSpace]);

  React.useEffect(() => {
    if (dedupedSpacesWithActions.length === 0) {
      setSpaces([]);
      return;
    }

    const fetchSpaces = async () => {
      const result = await Effect.runPromise(getSpaces({ spaceIds: dedupedSpacesWithActions }));
      setSpaces(result);
    };

    fetchSpaces();
  }, [spacesKey]);

  React.useEffect(() => {
    if (
      dedupedSpacesWithActions.length === 0 &&
      statusBarState.reviewState !== 'publish-complete' &&
      statusBarState.reviewState !== 'publishing-contract'
    ) {
      setIsReviewOpen(false);
    } else if (dedupedSpacesWithActions.length === 1) {
      setActiveSpace(dedupedSpacesWithActions[0] ?? '');
    }
  }, [spacesKey, statusBarState.reviewState, setIsReviewOpen]);

  const proposalName = proposals[activeSpace]?.name?.trim() ?? '';

  const valuesFromSpace = useValues({
    selector: t => t.spaceId === activeSpace && t.isLocal === true,
    includeDeleted: true,
  });

  const relationsFromSpace = useRelations({
    selector: r => r.spaceId === activeSpace && r.isLocal === true,
    includeDeleted: true,
  });

  const isReadyToPublish = React.useMemo(() => {
    if (!activeSpace || proposalName.length === 0) return false;
    const ops = Publish.prepareLocalDataForPublishing(valuesFromSpace, relationsFromSpace, activeSpace);

    return ops.length > 0;
  }, [activeSpace, proposalName, valuesFromSpace, relationsFromSpace]);

  const [entities, isLoadingChanges] = useLocalChanges(activeSpace);
  const activeSpaceMetadata = spaces.find(s => s.id === activeSpace);

  const handleProposalNameChange = (name: string) => {
    setProposals(prev => ({
      ...prev,
      [activeSpace]: { ...prev[activeSpace], name, description: prev[activeSpace]?.description ?? '' },
    }));
  };

  const handleSubmit = async () => {
    if (!activeSpace || !isReadyToPublish) return;
    setIsPublishing(true);

    await makeProposal({
      values: valuesFromSpace,
      relations: relationsFromSpace,
      spaceId: activeSpace,
      name: proposalName,
      onSuccess: () => {
        setProposals(prev => ({ ...prev, [activeSpace]: { name: '', description: '' } }));
      },
      onError: () => {},
    });

    setIsPublishing(false);
  };

  const handleDeleteAll = () => {
    if (!activeSpace) return;
    store.clearLocalChangesForSpace(activeSpace);
  };

  const spaceOptions = spaces.map(space => ({
    label: (
      <div className="flex items-center gap-2">
        {space.entity.image && (
          <div className="h-5 w-5 overflow-hidden rounded">
            <NativeGeoImage value={space.entity.image} alt="" className="h-full w-full object-cover" />
          </div>
        )}
        <span>{space.entity.name ?? space.id}</span>
      </div>
    ),
    value: space.id,
    disabled: false,
    onClick: () => setActiveSpace(space.id),
  }));

  return (
    <SlideUp isOpen={isReviewOpen} setIsOpen={setIsReviewOpen}>
      <RemoveScroll enabled={isReviewOpen} className="flex h-full w-full flex-col gap-2 bg-grey-01">
        <div className="flex shrink-0 items-center justify-between bg-white px-4 py-3">
          <div className="flex items-center gap-4">
            <SquareButton onClick={() => setIsReviewOpen(false)} icon={<Close />} />
            <span className="text-metadataMedium leading-none">Review your edits in</span>
            {dedupedSpacesWithActions.length > 1 ? (
              <Dropdown
                trigger={
                  <div className="flex items-center gap-2">
                    {activeSpaceMetadata?.entity.image && (
                      <div className="h-5 w-5 overflow-hidden rounded">
                        <NativeGeoImage
                          value={activeSpaceMetadata.entity.image}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}
                    <span>{activeSpaceMetadata?.entity.name ?? activeSpace}</span>
                  </div>
                }
                options={spaceOptions}
              />
            ) : (
              <div className="flex items-center gap-2">
                {activeSpaceMetadata?.entity.image && (
                  <div className="h-5 w-5 overflow-hidden rounded">
                    <NativeGeoImage
                      value={activeSpaceMetadata.entity.image}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
                <span className="text-metadataMedium font-semibold leading-none">
                  {activeSpaceMetadata?.entity.name ?? activeSpace}
                </span>
              </div>
            )}
          </div>
          <Button variant="primary" onClick={handleSubmit} disabled={!isReadyToPublish || isPublishing}>
            <Pending isPending={isPublishing}>
              {activeSpaceMetadata?.type === 'PERSONAL' ? 'Publish edits' : 'Propose edits'}
            </Pending>
          </Button>
        </div>
        <div className="px-2">
          <div className="rounded-xl bg-white px-4 py-10">
            <div className="relative mx-auto w-full max-w-[1350px] shrink-0">
              <div className="text-body">Proposal name</div>
              <input
                type="text"
                value={proposalName}
                onChange={e => handleProposalNameChange(e.target.value)}
                placeholder="Name your proposal..."
                className="w-full bg-transparent text-[40px] font-semibold text-text placeholder:text-grey-02 focus:outline-none"
              />
              <div className="absolute right-4 top-4 xl:right-[2ch]">
                <SmallButton onClick={handleDeleteAll}>Delete all</SmallButton>
              </div>
            </div>
          </div>
        </div>
        <div className="flex grow flex-col gap-2 overflow-y-scroll px-2 pb-2">
          {statusBarState.reviewState === 'publish-complete' ? (
            null
          ) : isLoadingChanges ? (
            <div className="rounded-xl bg-white p-4">
              <div className="relative mx-auto w-full max-w-[1350px] shrink-0">
                <div className="mb-4 flex items-center gap-3">
                  <Skeleton className="h-8 w-8" />
                  <Skeleton className="h-6 w-48" />
                </div>
                <div className="mb-4 grid grid-cols-2 gap-20">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-20">
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                  </div>
                  <div className="grid grid-cols-2 gap-20">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                </div>
              </div>
            </div>
          ) : entities.length === 0 ? (
            <div className="rounded-xl bg-white p-4">
              <div className="relative mx-auto w-full max-w-[1350px] shrink-0 py-12 text-center">
                <Text as="p" variant="body" className="text-grey-04">
                  No changes to review. Make some edits to see them here.
                </Text>
              </div>
            </div>
          ) : (
            entities.map(entity => (
              <div key={entity.entityId} className="rounded-xl bg-white p-4">
                <div className="relative mx-auto w-full max-w-[1350px] shrink-0">
                  <ChangedEntity entity={entity} spaceId={activeSpace} />
                </div>
              </div>
            ))
          )}
        </div>
      </RemoveScroll>
    </SlideUp>
  );
};

type ChangedEntityProps = {
  entity: EntityDiff;
  spaceId: string;
};

export const ChangedEntity = ({ entity, spaceId }: ChangedEntityProps) => {
  const typeRelations = entity.relations.filter(r => r.typeId === TYPES_PROPERTY_ID);
  const avatarRelations = entity.relations.filter(r => r.typeId === AVATAR_PROPERTY_ID);
  const coverRelations = entity.relations.filter(r => r.typeId === COVER_PROPERTY_ID);
  const otherRelations = entity.relations.filter(
    r => r.typeId !== TYPES_PROPERTY_ID && r.typeId !== AVATAR_PROPERTY_ID && r.typeId !== COVER_PROPERTY_ID
  );

  const nameChange = entity.values.find(v => v.propertyId === NAME_PROPERTY_ID);
  const otherValues = entity.values.filter(
    v => v.propertyId !== NAME_PROPERTY_ID && v.propertyId !== AVATAR_PROPERTY_ID && v.propertyId !== COVER_PROPERTY_ID
  );

  const avatarChangeImageUrl =
    avatarRelations.find(r => r.after?.imageUrl)?.after?.imageUrl ??
    avatarRelations.find(r => r.before?.imageUrl)?.before?.imageUrl;
  const fetchedAvatarUrl = useEntityAvatarUrl(entity.entityId, spaceId);
  const resolvedAvatarUrl = avatarChangeImageUrl ?? fetchedAvatarUrl;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-grey-02">
          {resolvedAvatarUrl && (
            <NativeGeoImage value={resolvedAvatarUrl} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <h2 className="text-xl font-semibold">{entity.name}</h2>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-20">
        <div className="text-sm text-grey-04">Current</div>
        <div className="text-sm text-grey-04">Proposed edits</div>
      </div>

      <div className="space-y-4">
        {(avatarRelations.length > 0 || coverRelations.length > 0) && (
          <MediaChangeRow avatarRelations={avatarRelations} coverRelations={coverRelations} spaceId={spaceId} />
        )}

        {nameChange && (
          <div className="grid grid-cols-2 gap-20">
            <div className="flex items-center">
              <TextDiffDisplay
                value={nameChange.before}
                diff={nameChange.type === 'TEXT' ? (nameChange as TextValueChange).diff : undefined}
                side="before"
                className="text-mainPage"
              />
            </div>
            <div className="flex items-center">
              <TextDiffDisplay
                value={nameChange.after}
                diff={nameChange.type === 'TEXT' ? (nameChange as TextValueChange).diff : undefined}
                side="after"
                className="text-mainPage"
              />
            </div>
          </div>
        )}

        {typeRelations.length > 0 && <TypesChangeRow relations={typeRelations} />}

        {entity.blocks.map(block => (
          <BlockChangeRow key={block.id} block={block} />
        ))}

        {otherValues.length > 0 && (
          <div className="grid grid-cols-2 gap-20">
            <div className="rounded-lg border border-grey-02 p-5 shadow-button">
              {otherValues.map(value => (
                <ValueChangeCell key={value.propertyId} value={value} side="before" />
              ))}
            </div>
            <div className="rounded-lg border border-grey-02 p-5 shadow-button">
              {otherValues.map(value => (
                <ValueChangeCell key={value.propertyId} value={value} side="after" />
              ))}
            </div>
          </div>
        )}

        {otherRelations.length > 0 && (
          <div className="grid grid-cols-2 gap-20">
            <div className="rounded-lg border border-grey-02 p-5 shadow-button">
              {groupRelationsByType(otherRelations).map(([typeId, typeName, relations]) => (
                <RelationGroupCell
                  key={typeId}
                  typeId={typeId}
                  typeName={typeName}
                  relations={relations}
                  side="before"
                />
              ))}
            </div>
            <div className="rounded-lg border border-grey-02 p-5 shadow-button">
              {groupRelationsByType(otherRelations).map(([typeId, typeName, relations]) => (
                <RelationGroupCell
                  key={typeId}
                  typeId={typeId}
                  typeName={typeName}
                  relations={relations}
                  side="after"
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

type MediaChangeRowProps = {
  avatarRelations: RelationChange[];
  coverRelations: RelationChange[];
  spaceId: string;
};

const MediaChangeRow = ({ avatarRelations, coverRelations, spaceId }: MediaChangeRowProps) => {
  const avatarBeforeUrl = avatarRelations.find(r => r.before?.imageUrl)?.before?.imageUrl ?? null;
  const avatarAfterUrl = avatarRelations.find(r => r.after?.imageUrl)?.after?.imageUrl ?? null;
  const coverBeforeUrl = coverRelations.find(r => r.before?.imageUrl)?.before?.imageUrl ?? null;
  const coverAfterUrl = coverRelations.find(r => r.after?.imageUrl)?.after?.imageUrl ?? null;

  const avatarAfterEntityId = avatarRelations.find(r => r.after)?.after?.toEntityId;
  const coverAfterEntityId = coverRelations.find(r => r.after)?.after?.toEntityId;
  const localAvatarUrl = useImageUrlFromEntity(avatarAfterEntityId, spaceId);
  const localCoverUrl = useImageUrlFromEntity(coverAfterEntityId, spaceId);

  const resolvedAvatarAfterUrl = avatarAfterUrl ?? localAvatarUrl ?? null;
  const resolvedCoverAfterUrl = coverAfterUrl ?? localCoverUrl ?? null;

  const hasAvatarChange = avatarRelations.length > 0;
  const hasCoverChange = coverRelations.length > 0;

  return (
    <div className="grid grid-cols-2 gap-20">
      <div>
        <div className="relative">
          {hasCoverChange && coverBeforeUrl && (
            <div className={cx('aspect-[17/5] w-full overflow-hidden rounded bg-grey-01', 'ring-deleted ring-4')}>
              <NativeGeoImage value={coverBeforeUrl} alt="Cover" className="h-full w-full object-cover" />
            </div>
          )}
          {hasAvatarChange && avatarBeforeUrl && (
            <div
              className={cx(
                'h-[80px] w-[80px] overflow-hidden rounded bg-grey-01',
                hasCoverChange && coverBeforeUrl && 'absolute bottom-0 left-4 translate-y-1/2',
                'ring-deleted ring-4'
              )}
            >
              <NativeGeoImage value={avatarBeforeUrl} alt="Avatar" className="h-full w-full object-cover" />
            </div>
          )}
        </div>
        {hasAvatarChange && hasCoverChange && avatarBeforeUrl && coverBeforeUrl && (
          <div className="invisible h-[40px]" />
        )}
      </div>

      <div>
        <div className="relative">
          {hasCoverChange && resolvedCoverAfterUrl && (
            <div className={cx('aspect-[17/5] w-full overflow-hidden rounded bg-grey-01', 'ring-added ring-4')}>
              <NativeGeoImage value={resolvedCoverAfterUrl} alt="Cover" className="h-full w-full object-cover" />
            </div>
          )}
          {hasAvatarChange && resolvedAvatarAfterUrl && (
            <div
              className={cx(
                'h-[80px] w-[80px] overflow-hidden rounded bg-grey-01',
                hasCoverChange && resolvedCoverAfterUrl && 'absolute bottom-0 left-4 translate-y-1/2',
                'ring-added ring-4'
              )}
            >
              <NativeGeoImage value={resolvedAvatarAfterUrl} alt="Avatar" className="h-full w-full object-cover" />
            </div>
          )}
        </div>
        {hasAvatarChange && hasCoverChange && resolvedAvatarAfterUrl && resolvedCoverAfterUrl && (
          <div className="invisible h-[40px]" />
        )}
      </div>
    </div>
  );
};

type TypesChangeRowProps = {
  relations: RelationChange[];
};

const TypesChangeRow = ({ relations }: TypesChangeRowProps) => {
  const addedTypes = relations.filter(r => r.changeType === 'ADD').map(r => r.after?.toEntityId);
  const removedTypes = relations.filter(r => r.changeType === 'REMOVE').map(r => r.before?.toEntityId);

  return (
    <div className="grid grid-cols-2 gap-20">
      <div className="flex flex-wrap gap-2">
        {removedTypes.map((typeId, i) => (
          <div
            key={i}
            className="bg-deleted inline-flex items-center gap-1 rounded border border-grey-02 px-1.5 py-0.5 text-metadata tabular-nums text-text line-through decoration-1"
          >
            {typeId}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {addedTypes.map((typeId, i) => (
          <div
            key={i}
            className="bg-added inline-flex items-center gap-1 rounded border border-grey-02 px-1.5 py-0.5 text-metadata tabular-nums text-text"
          >
            {typeId}
          </div>
        ))}
      </div>
    </div>
  );
};

type BlockChangeRowProps = {
  block: BlockChange;
};

const BlockChangeRow = ({ block }: BlockChangeRowProps) => {
  switch (block.type) {
    case 'textBlock':
      return (
        <div className="grid grid-cols-2 gap-20">
          <TextBlockCell block={block} side="before" />
          <TextBlockCell block={block} side="after" />
        </div>
      );
    case 'imageBlock':
      return (
        <div className="grid grid-cols-2 gap-20">
          <ImageBlockCell block={block} side="before" />
          <ImageBlockCell block={block} side="after" />
        </div>
      );
    case 'dataBlock':
      return (
        <div className="grid grid-cols-2 gap-20">
          <DataBlockCell block={block} side="before" />
          <DataBlockCell block={block} side="after" />
        </div>
      );
  }
};

const renderHeading = (level: number, children: React.ReactNode): React.ReactNode => {
  switch (level) {
    case 1:
      return <h1>{children}</h1>;
    case 2:
      return <h2>{children}</h2>;
    case 3:
      return <h3>{children}</h3>;
    case 4:
      return <h4>{children}</h4>;
    case 5:
      return <h5>{children}</h5>;
    case 6:
      return <h6>{children}</h6>;
    default:
      return <p>{children}</p>;
  }
};

type MarkdownDiffProps = {
  text: string;
  highlightClass?: string;
};

const MarkdownDiffRenderer = ({ text, highlightClass }: MarkdownDiffProps) => {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = headingMatch[2];
      elements.push(
        <div key={i} className="react-renderer node-heading">
          {renderHeading(level, <span className={cx(highlightClass)}>{content}</span>)}
        </div>
      );
      i++;
      continue;
    }

    if (line.match(/^[-*]\s+/)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^[-*]\s+(.+)$/)) {
        const itemContent = lines[i].replace(/^[-*]\s+/, '');
        listItems.push(
          <li key={i}>
            <div className="react-renderer node-paragraph">
              <div className="whitespace-normal">
                <p>
                  <span className={cx(highlightClass)}>{itemContent}</span>
                </p>
              </div>
            </div>
          </li>
        );
        i++;
      }
      elements.push(<ul key={`ul-${i}`}>{listItems}</ul>);
      continue;
    }

    if (line.trim()) {
      elements.push(
        <div key={i} className="react-renderer node-paragraph">
          <div className="whitespace-normal">
            <p>
              <span className={cx(highlightClass)}>{line}</span>
            </p>
          </div>
        </div>
      );
    }
    i++;
  }

  return <>{elements}</>;
};

type TextBlockCellProps = {
  block: BlockChange & { type: 'textBlock' };
  side: 'before' | 'after';
};

const TextBlockCell = ({ block, side }: TextBlockCellProps) => {
  const value = side === 'before' ? block.before : block.after;

  if (value === null) {
    return <div />;
  }

  const diff = 'diff' in block ? block.diff : undefined;
  const isNew = block.before === null;
  const isDeleted = block.after === null;

  if (isNew || isDeleted) {
    const highlightClass = side === 'before' ? 'rounded bg-deleted line-through decoration-1' : 'rounded bg-added';

    return (
      <div className="ProseMirror text-body">
        <MarkdownDiffRenderer text={value} highlightClass={highlightClass} />
      </div>
    );
  }

  return (
    <div className="ProseMirror text-body">
      {diff ? (
        <MarkdownDiffWithChunks diff={diff} side={side} fullText={value} />
      ) : (
        <span className={cx('inline rounded', side === 'before' ? 'bg-deleted line-through decoration-1' : 'bg-added')}>
          {value}
        </span>
      )}
    </div>
  );
};

type MarkdownDiffWithChunksProps = {
  diff: DiffChunk[];
  side: 'before' | 'after';
  fullText: string;
};

const MarkdownDiffWithChunks = ({ diff, side, fullText }: MarkdownDiffWithChunksProps) => {
  const hasMarkdown = /^#{1,6}\s|^[-*]\s/.test(fullText);

  if (!hasMarkdown) {
    return <DiffRenderer diff={diff} side={side} />;
  }

  const visibleChunks = diff.filter(chunk => {
    if (side === 'before' && chunk.added) return false;
    if (side === 'after' && chunk.removed) return false;
    return true;
  });

  const fullVisibleText = visibleChunks.map(c => c.value).join('');
  const lines = fullVisibleText.split('\n');
  const elements: React.ReactNode[] = [];
  let chunkIndex = 0;
  let charIndex = 0;

  const getStyledText = (text: string): React.ReactNode[] => {
    const result: React.ReactNode[] = [];
    let remaining = text;
    let localCharIndex = charIndex;

    while (remaining.length > 0 && chunkIndex < visibleChunks.length) {
      const chunk = visibleChunks[chunkIndex];
      const chunkStart = localCharIndex - charIndex;
      const chunkRemaining = chunk.value.slice(chunkStart);

      if (chunkRemaining.length === 0) {
        chunkIndex++;
        localCharIndex = 0;
        charIndex = 0;
        continue;
      }

      const takeLength = Math.min(remaining.length, chunkRemaining.length);
      const takenText = remaining.slice(0, takeLength);
      remaining = remaining.slice(takeLength);

      const isChanged = chunk.added || chunk.removed;
      result.push(
        <span
          key={`${chunkIndex}-${localCharIndex}`}
          className={cx(
            isChanged && 'inline rounded',
            chunk.removed && 'bg-deleted line-through decoration-1',
            chunk.added && 'bg-added'
          )}
        >
          {takenText}
        </span>
      );

      localCharIndex += takeLength;
      if (localCharIndex - charIndex >= chunk.value.length) {
        chunkIndex++;
        charIndex += chunk.value.length;
        localCharIndex = charIndex;
      }
    }

    return result;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (i > 0) {
      charIndex++;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      charIndex += headingMatch[1].length + 1;
      elements.push(
        <div key={i} className="react-renderer node-heading">
          {renderHeading(level, getStyledText(headingMatch[2]))}
        </div>
      );
      charIndex += headingMatch[2].length;
      continue;
    }

    const listMatch = line.match(/^([-*])\s+(.+)$/);
    if (listMatch) {
      charIndex += 2;
      elements.push(
        <ul key={`ul-${i}`}>
          <li>
            <div className="react-renderer node-paragraph">
              <div className="whitespace-normal">
                <p>{getStyledText(listMatch[2])}</p>
              </div>
            </div>
          </li>
        </ul>
      );
      charIndex += listMatch[2].length;
      continue;
    }

    if (line.trim()) {
      elements.push(
        <div key={i} className="react-renderer node-paragraph">
          <div className="whitespace-normal">
            <p>{getStyledText(line)}</p>
          </div>
        </div>
      );
      charIndex += line.length;
    } else {
      charIndex += line.length;
    }
  }

  return <>{elements}</>;
};

type ImageBlockCellProps = {
  block: BlockChange & { type: 'imageBlock' };
  side: 'before' | 'after';
};

const ImageBlockCell = ({ block, side }: ImageBlockCellProps) => {
  const value = side === 'before' ? block.before : block.after;

  if (value === null) {
    return <div />;
  }

  const ringClass = side === 'before' ? 'ring-4 ring-deleted' : 'ring-4 ring-added';

  return (
    <div className={cx('aspect-video w-full overflow-hidden rounded bg-grey-01', ringClass)}>
      <NativeGeoImage value={value} alt="" className="h-full w-full object-cover" />
    </div>
  );
};

type DataBlockCellProps = {
  block: BlockChange & { type: 'dataBlock' };
  side: 'before' | 'after';
};

const DataBlockCell = ({ block, side }: DataBlockCellProps) => {
  const value = side === 'before' ? block.before : block.after;
  const isNew = block.before === null;
  const isDeleted = block.after === null;

  if ((isNew && side === 'before') || (isDeleted && side === 'after')) {
    return <div />;
  }

  return (
    <div
      className={cx(
        'overflow-hidden rounded-lg border border-grey-02 shadow-button',
        isNew && side === 'after' && 'ring-added ring-4',
        isDeleted && side === 'before' && 'ring-deleted ring-4'
      )}
    >
      <div className="flex items-center justify-between border-b border-grey-02 bg-white px-4 py-3">
        <div
          className={cx(
            'text-smallTitle font-semibold text-text',
            block.before !== block.after && side === 'before' && 'bg-deleted rounded line-through decoration-1',
            block.before !== block.after && side === 'after' && 'bg-added rounded'
          )}
        >
          {value}
        </div>
      </div>
      <div className="bg-grey-01 p-4">
        <div className="flex items-center justify-center py-8 text-metadata text-grey-04">Data block preview</div>
      </div>
    </div>
  );
};

type ValueChangeCellProps = {
  value: ValueChange;
  side: 'before' | 'after';
};

const ValueChangeCell = ({ value, side }: ValueChangeCellProps) => {
  const displayValue = side === 'before' ? value.before : value.after;
  const diff = value.type === 'TEXT' ? (value as TextValueChange).diff : undefined;

  return (
    <div className="mb-6 last:mb-0">
      <Text as="p" variant="bodySemibold">
        {value.propertyName ?? value.propertyId}
      </Text>
      <div>
        {value.type === 'TEXT' && diff ? (
          <TextDiffDisplay value={displayValue} diff={diff} side={side} />
        ) : value.type === 'BOOL' ? (
          <BooleanDisplay value={displayValue} side={side} />
        ) : value.type === 'POINT' ? (
          <PointDisplay value={displayValue} side={side} />
        ) : value.type === 'DATE' || value.type === 'DATETIME' ? (
          <DateDisplay value={displayValue} side={side} />
        ) : (
          <SimpleValueDisplay value={displayValue} side={side} />
        )}
      </div>
    </div>
  );
};

type RelationGroupCellProps = {
  typeId: string;
  typeName?: string | null;
  relations: RelationChange[];
  side: 'before' | 'after';
};

const RelationGroupCell = ({ typeId, typeName, relations, side }: RelationGroupCellProps) => {
  const chips = relations
    .map(r => {
      if (side === 'before') {
        if (r.changeType === 'REMOVE' || r.changeType === 'UPDATE') {
          return {
            entityId: r.before?.toEntityId,
            entityName: r.before?.toEntityName,
            changeType: r.changeType,
          };
        }
        return null;
      } else {
        if (r.changeType === 'ADD' || r.changeType === 'UPDATE') {
          return {
            entityId: r.after?.toEntityId,
            entityName: r.after?.toEntityName,
            changeType: r.changeType,
          };
        }
        return null;
      }
    })
    .filter(Boolean);

  if (chips.length === 0) return null;

  return (
    <div className="mb-6 last:mb-0">
      <Text as="p" variant="bodySemibold">
        {typeName ?? typeId}
      </Text>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip, i) => (
          <div
            key={i}
            className={cx(
              'inline-flex items-center gap-1 rounded border border-grey-02 px-1.5 py-0.5 text-metadata tabular-nums text-text',
              side === 'before' && 'bg-deleted line-through decoration-1',
              side === 'after' && 'bg-added'
            )}
          >
            {chip?.entityName ?? chip?.entityId}
          </div>
        ))}
      </div>
    </div>
  );
};

type TextDiffDisplayProps = {
  value: string | null;
  diff?: DiffChunk[];
  side: 'before' | 'after';
  className?: string;
};

const TextDiffDisplay = ({ value, diff, side, className }: TextDiffDisplayProps) => {
  if (value === null) return null;

  if (diff) {
    return (
      <span className={className}>
        <DiffRenderer diff={diff} side={side} />
      </span>
    );
  }

  return (
    <span
      className={cx(
        'inline rounded',
        side === 'before' ? 'bg-deleted line-through decoration-1' : 'bg-added',
        className
      )}
    >
      {value}
    </span>
  );
};

type DiffRendererProps = {
  diff: DiffChunk[];
  side: 'before' | 'after';
};

const DiffRenderer = ({ diff, side }: DiffRendererProps) => {
  return (
    <>
      {diff.map((chunk, i) => {
        if (side === 'before' && chunk.added) return null;
        if (side === 'after' && chunk.removed) return null;

        const isChanged = chunk.added || chunk.removed;

        return (
          <span
            key={i}
            className={cx(
              isChanged && 'inline rounded',
              chunk.removed && 'bg-deleted line-through decoration-1',
              chunk.added && 'bg-added'
            )}
          >
            {chunk.value}
          </span>
        );
      })}
    </>
  );
};

type SimpleValueDisplayProps = {
  value: string | null;
  side: 'before' | 'after';
};

const SimpleValueDisplay = ({ value, side }: SimpleValueDisplayProps) => {
  if (value === null) return null;

  return (
    <span className={cx('inline rounded', side === 'before' ? 'bg-deleted line-through decoration-1' : 'bg-added')}>
      {value}
    </span>
  );
};

type BooleanDisplayProps = {
  value: string | null;
  side: 'before' | 'after';
};

const BooleanDisplay = ({ value, side }: BooleanDisplayProps) => {
  if (value === null) return null;

  const displayValue = value === 'true' ? 'Yes' : 'No';

  return (
    <span className={cx('inline rounded', side === 'before' ? 'bg-deleted line-through decoration-1' : 'bg-added')}>
      {displayValue}
    </span>
  );
};

type PointDisplayProps = {
  value: string | null;
  side: 'before' | 'after';
};

const PointDisplay = ({ value, side }: PointDisplayProps) => {
  if (value === null) return null;

  return (
    <span
      className={cx(
        'inline rounded font-mono text-sm',
        side === 'before' ? 'bg-deleted line-through decoration-1' : 'bg-added'
      )}
    >
      {value}
    </span>
  );
};

type DateDisplayProps = {
  value: string | null;
  side: 'before' | 'after';
};

const DateDisplay = ({ value, side }: DateDisplayProps) => {
  if (value === null) return null;

  let displayValue = value;
  try {
    const date = new Date(value);
    displayValue = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    // use raw value
  }

  return (
    <span className={cx('inline rounded', side === 'before' ? 'bg-deleted line-through decoration-1' : 'bg-added')}>
      {displayValue}
    </span>
  );
};

function groupRelationsByType(relations: RelationChange[]): [string, string | null | undefined, RelationChange[]][] {
  const groups = new Map<string, { typeName: string | null | undefined; relations: RelationChange[] }>();

  for (const relation of relations) {
    const existing = groups.get(relation.typeId);
    if (existing) {
      existing.relations.push(relation);
    } else {
      groups.set(relation.typeId, { typeName: relation.typeName, relations: [relation] });
    }
  }

  return Array.from(groups.entries()).map(([typeId, { typeName, relations }]) => [typeId, typeName, relations]);
}
