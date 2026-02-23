'use client';

import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk';
import cx from 'classnames';

import * as React from 'react';

import { reactiveRelations } from '~/core/sync/store';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import type {
  BlockChange,
  DataBlockChange,
  DiffChunk,
  EntityDiff,
  RelationChange,
  TextValueChange,
  ValueChange,
} from '~/core/utils/diff/types';
import { useEntityMediaUrl, useImageUrlFromEntity, useVideoUrlFromEntity } from '~/core/utils/use-entity-media';
import { getVideoPath } from '~/core/utils/utils';

import { Checkbox, getChecked } from '~/design-system/checkbox';
import { NativeGeoImage } from '~/design-system/geo-image';
import { Text } from '~/design-system/text';
import { Tooltip } from '~/design-system/tooltip';

import { TableBlockLoadingPlaceholder } from '~/partials/blocks/table/table-block';

const TYPES_PROPERTY_ID = SystemIds.TYPES_PROPERTY;
const AVATAR_PROPERTY_ID = ContentIds.AVATAR_PROPERTY;
const COVER_PROPERTY_ID = SystemIds.COVER_PROPERTY;
const NAME_PROPERTY_ID = SystemIds.NAME_PROPERTY;

export function hasVisibleChanges(entity: EntityDiff): boolean {
  const hasName = entity.values.some(v => v.propertyId === NAME_PROPERTY_ID && (v.before !== null || v.after !== null));
  const hasBlocks = entity.blocks.length > 0;

  const hasAvatarOrCover = entity.relations.some(
    r => (r.typeId === AVATAR_PROPERTY_ID || r.typeId === COVER_PROPERTY_ID) && (r.before !== null || r.after !== null)
  );
  const hasTypes = entity.relations.some(
    r => r.typeId === TYPES_PROPERTY_ID && (r.before !== null || r.after !== null)
  );

  const nonSpecialRelations = entity.relations.filter(
    r => r.typeId !== TYPES_PROPERTY_ID && r.typeId !== AVATAR_PROPERTY_ID && r.typeId !== COVER_PROPERTY_ID
  );
  const hasImageRelations = nonSpecialRelations.some(r => r.after?.imageUrl || r.before?.imageUrl);
  const hasVideoRelations = nonSpecialRelations.some(r => r.after?.videoUrl || r.before?.videoUrl);
  const hasOtherRelations = nonSpecialRelations.some(
    r => !r.after?.imageUrl && !r.before?.imageUrl && !r.after?.videoUrl && !r.before?.videoUrl
  );

  const imageRelationPropertyIds = new Set(
    nonSpecialRelations.filter(r => r.after?.imageUrl || r.before?.imageUrl).map(r => r.typeId)
  );
  const videoRelationPropertyIds = new Set(
    nonSpecialRelations.filter(r => r.after?.videoUrl || r.before?.videoUrl).map(r => r.typeId)
  );
  const otherRelationPropertyIds = new Set(
    nonSpecialRelations
      .filter(r => !r.after?.imageUrl && !r.before?.imageUrl && !r.after?.videoUrl && !r.before?.videoUrl)
      .map(r => r.typeId)
  );
  const hasValues = entity.values.some(
    v =>
      v.propertyId !== NAME_PROPERTY_ID &&
      v.propertyId !== AVATAR_PROPERTY_ID &&
      v.propertyId !== COVER_PROPERTY_ID &&
      (v.type as string) !== 'RELATION' &&
      !imageRelationPropertyIds.has(v.propertyId) &&
      !videoRelationPropertyIds.has(v.propertyId) &&
      !otherRelationPropertyIds.has(v.propertyId) &&
      (v.before !== null || v.after !== null)
  );

  return (
    hasName ||
    hasBlocks ||
    hasAvatarOrCover ||
    hasTypes ||
    hasImageRelations ||
    hasVideoRelations ||
    hasOtherRelations ||
    hasValues
  );
}

type ChangedEntityProps = {
  entity: EntityDiff;
  spaceId: string;
};

export const ChangedEntity = ({ entity, spaceId }: ChangedEntityProps) => {
  const typeRelations = entity.relations.filter(r => r.typeId === TYPES_PROPERTY_ID);
  const avatarRelations = entity.relations.filter(r => r.typeId === AVATAR_PROPERTY_ID);
  const coverRelations = entity.relations.filter(r => r.typeId === COVER_PROPERTY_ID);

  const nonSpecialRelations = entity.relations.filter(
    r => r.typeId !== TYPES_PROPERTY_ID && r.typeId !== AVATAR_PROPERTY_ID && r.typeId !== COVER_PROPERTY_ID
  );
  const imageRelations = nonSpecialRelations.filter(r => r.after?.imageUrl || r.before?.imageUrl);
  const videoRelations = nonSpecialRelations.filter(r => r.after?.videoUrl || r.before?.videoUrl);
  const otherRelations = nonSpecialRelations.filter(
    r => !r.after?.imageUrl && !r.before?.imageUrl && !r.after?.videoUrl && !r.before?.videoUrl
  );

  const nameChange = entity.values.find(v => v.propertyId === NAME_PROPERTY_ID);

  const otherValues = entity.values.filter(
    v =>
      v.propertyId !== NAME_PROPERTY_ID &&
      v.propertyId !== AVATAR_PROPERTY_ID &&
      v.propertyId !== COVER_PROPERTY_ID &&
      (v.type as string) !== 'RELATION'
  );

  const imageRelationPropertyIds = new Set(imageRelations.map(r => r.typeId));
  const videoRelationPropertyIds = new Set(videoRelations.map(r => r.typeId));
  const otherRelationPropertyIds = new Set(otherRelations.map(r => r.typeId));
  const filteredOtherValues = otherValues.filter(
    v =>
      !imageRelationPropertyIds.has(v.propertyId) &&
      !videoRelationPropertyIds.has(v.propertyId) &&
      !otherRelationPropertyIds.has(v.propertyId)
  );

  const avatarChangeImageUrl =
    avatarRelations.find(r => r.after?.imageUrl)?.after?.imageUrl ??
    avatarRelations.find(r => r.before?.imageUrl)?.before?.imageUrl;
  const coverChangeImageUrl =
    coverRelations.find(r => r.after?.imageUrl)?.after?.imageUrl ??
    coverRelations.find(r => r.before?.imageUrl)?.before?.imageUrl;
  const fetchedMediaUrl = useEntityMediaUrl(entity.entityId, spaceId);

  const resolvedAvatarUrl = avatarChangeImageUrl ?? coverChangeImageUrl ?? fetchedMediaUrl;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        {resolvedAvatarUrl && (
          <div className="h-8 w-8 shrink-0 overflow-hidden rounded">
            <NativeGeoImage value={resolvedAvatarUrl} alt="" className="h-full w-full object-cover" />
          </div>
        )}
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
          <BlockChangeRow key={block.id} block={block} spaceId={spaceId} />
        ))}

        {(filteredOtherValues.length > 0 ||
          otherRelations.length > 0 ||
          imageRelations.length > 0 ||
          videoRelations.length > 0) && (
          <div className="grid grid-cols-2 gap-20">
            {filteredOtherValues.some(v => v.before !== null) ||
            otherRelations.some(r => r.changeType === 'REMOVE' || r.changeType === 'UPDATE') ||
            imageRelations.some(r => r.changeType === 'REMOVE' || r.changeType === 'UPDATE') ||
            videoRelations.some(r => r.changeType === 'REMOVE' || r.changeType === 'UPDATE') ? (
              <div className="rounded-lg border border-grey-02 p-5 shadow-button">
                {groupRelationsByType(imageRelations).map(([typeId, typeName, relations]) => (
                  <ImagePropertyCell
                    key={typeId}
                    typeName={typeName}
                    typeId={typeId}
                    relations={relations}
                    spaceId={spaceId}
                    side="before"
                  />
                ))}
                {groupRelationsByType(videoRelations).map(([typeId, typeName, relations]) => (
                  <VideoPropertyCell
                    key={typeId}
                    typeName={typeName}
                    typeId={typeId}
                    relations={relations}
                    spaceId={spaceId}
                    side="before"
                  />
                ))}
                {filteredOtherValues.map(value => (
                  <ValueChangeCell key={value.propertyId} value={value} side="before" />
                ))}
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
            ) : (
              <div />
            )}
            {filteredOtherValues.some(v => v.after !== null) ||
            otherRelations.some(r => r.changeType === 'ADD' || r.changeType === 'UPDATE') ||
            imageRelations.some(r => r.changeType === 'ADD' || r.changeType === 'UPDATE') ||
            videoRelations.some(r => r.changeType === 'ADD' || r.changeType === 'UPDATE') ? (
              <div className="rounded-lg border border-grey-02 p-5 shadow-button">
                {groupRelationsByType(imageRelations).map(([typeId, typeName, relations]) => (
                  <ImagePropertyCell
                    key={typeId}
                    typeName={typeName}
                    typeId={typeId}
                    relations={relations}
                    spaceId={spaceId}
                    side="after"
                  />
                ))}
                {groupRelationsByType(videoRelations).map(([typeId, typeName, relations]) => (
                  <VideoPropertyCell
                    key={typeId}
                    typeName={typeName}
                    typeId={typeId}
                    relations={relations}
                    spaceId={spaceId}
                    side="after"
                  />
                ))}
                {filteredOtherValues.map(value => (
                  <ValueChangeCell key={value.propertyId} value={value} side="after" />
                ))}
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
            ) : (
              <div />
            )}
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
            <div className={cx('aspect-17/5 w-full overflow-hidden rounded bg-grey-01', 'ring-4 ring-deleted')}>
              <NativeGeoImage value={coverBeforeUrl} alt="Cover" className="h-full w-full object-cover" />
            </div>
          )}
          {hasAvatarChange && avatarBeforeUrl && (
            <div
              className={cx(
                'h-[80px] w-[80px] overflow-hidden rounded bg-grey-01',
                hasCoverChange && coverBeforeUrl && 'absolute bottom-0 left-4 translate-y-1/2',
                'ring-4 ring-deleted'
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
            <div className={cx('aspect-17/5 w-full overflow-hidden rounded bg-grey-01', 'ring-4 ring-added')}>
              <NativeGeoImage value={resolvedCoverAfterUrl} alt="Cover" className="h-full w-full object-cover" />
            </div>
          )}
          {hasAvatarChange && resolvedAvatarAfterUrl && (
            <div
              className={cx(
                'h-[80px] w-[80px] overflow-hidden rounded bg-grey-01',
                hasCoverChange && resolvedCoverAfterUrl && 'absolute bottom-0 left-4 translate-y-1/2',
                'ring-4 ring-added'
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

type ImagePropertyCellProps = {
  typeName?: string | null;
  typeId: string;
  relations: RelationChange[];
  spaceId: string;
  side: 'before' | 'after';
};

const ImagePropertyCell = ({ typeName, typeId, relations, spaceId, side }: ImagePropertyCellProps) => {
  const url =
    side === 'before'
      ? (relations.find(r => r.before?.imageUrl)?.before?.imageUrl ?? null)
      : (relations.find(r => r.after?.imageUrl)?.after?.imageUrl ?? null);

  const afterEntityId = relations.find(r => r.after)?.after?.toEntityId;
  const localImageUrl = useImageUrlFromEntity(afterEntityId, spaceId);
  const resolvedUrl = side === 'after' ? (url ?? localImageUrl ?? null) : url;

  if (resolvedUrl === null) return null;

  const ringClass = side === 'before' ? 'ring-2 ring-deleted' : 'ring-2 ring-added';

  return (
    <div className="mb-6 last:mb-0">
      <Text as="p" variant="bodySemibold">
        {typeName ?? typeId}
      </Text>
      <div className={cx('mt-1 h-20 w-20 overflow-hidden rounded-lg', ringClass)}>
        <NativeGeoImage value={resolvedUrl} alt={typeName ?? ''} className="h-full w-full object-cover" />
      </div>
    </div>
  );
};

type VideoPropertyCellProps = {
  typeName?: string | null;
  typeId: string;
  relations: RelationChange[];
  spaceId: string;
  side: 'before' | 'after';
};

const VideoPropertyCell = ({ typeName, typeId, relations, spaceId, side }: VideoPropertyCellProps) => {
  const url =
    side === 'before'
      ? (relations.find(r => r.before?.videoUrl)?.before?.videoUrl ?? null)
      : (relations.find(r => r.after?.videoUrl)?.after?.videoUrl ?? null);

  const afterEntityId = relations.find(r => r.after)?.after?.toEntityId;
  const localVideoUrl = useVideoUrlFromEntity(afterEntityId, spaceId);
  const resolvedUrl = side === 'after' ? (url ?? localVideoUrl ?? null) : url;

  if (resolvedUrl === null) return null;

  const ringClass = side === 'before' ? 'ring-2 ring-deleted' : 'ring-2 ring-added';
  const videoSrc = getVideoPath(resolvedUrl);

  return (
    <div className="mb-6 last:mb-0">
      <Text as="p" variant="bodySemibold">
        {typeName ?? typeId}
      </Text>
      <div className={cx('mt-1 aspect-video w-full max-w-[240px] overflow-hidden rounded-lg', ringClass)}>
        <video src={videoSrc} controls className="h-full w-full object-cover" />
      </div>
    </div>
  );
};

type TypesChangeRowProps = {
  relations: RelationChange[];
};

const TypesChangeRow = ({ relations }: TypesChangeRowProps) => {
  const addedTypes = relations
    .filter(r => r.changeType === 'ADD')
    .map(r => ({ id: r.after?.toEntityId, name: r.after?.toEntityName }));
  const removedTypes = relations
    .filter(r => r.changeType === 'REMOVE')
    .map(r => ({ id: r.before?.toEntityId, name: r.before?.toEntityName }));

  return (
    <div className="grid grid-cols-2 gap-20">
      <div className="flex flex-wrap gap-2">
        {removedTypes.map((type, i) => (
          <div
            key={i}
            className="inline-flex items-center gap-1 rounded border border-grey-02 bg-deleted px-1.5 py-0.5 text-metadata text-text tabular-nums line-through decoration-1"
          >
            {type.name ?? type.id}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {addedTypes.map((type, i) => (
          <div
            key={i}
            className="inline-flex items-center gap-1 rounded border border-grey-02 bg-added px-1.5 py-0.5 text-metadata text-text tabular-nums"
          >
            {type.name ?? type.id}
          </div>
        ))}
      </div>
    </div>
  );
};

type BlockChangeRowProps = {
  block: BlockChange;
  spaceId: string;
};

const BlockChangeRow = ({ block, spaceId }: BlockChangeRowProps) => {
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
    case 'videoBlock':
      return (
        <div className="grid grid-cols-2 gap-20">
          <VideoBlockCell block={block} side="before" />
          <VideoBlockCell block={block} side="after" />
        </div>
      );
    case 'dataBlock':
      return (
        <div className="grid grid-cols-2 gap-20">
          <DataBlockCell block={block} side="before" spaceId={spaceId} />
          <DataBlockCell block={block} side="after" spaceId={spaceId} />
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

type VideoBlockCellProps = {
  block: BlockChange & { type: 'videoBlock' };
  side: 'before' | 'after';
};

const VideoBlockCell = ({ block, side }: VideoBlockCellProps) => {
  const value = side === 'before' ? block.before : block.after;

  if (value === null) {
    return <div />;
  }

  const ringClass = side === 'before' ? 'ring-4 ring-deleted' : 'ring-4 ring-added';
  const videoSrc = getVideoPath(value);

  return (
    <div className={cx('aspect-video w-full overflow-hidden rounded bg-grey-01', ringClass)}>
      <video src={videoSrc} controls className="h-full w-full object-cover" />
    </div>
  );
};

function useBlockViewEntityId(blockEntityId: string, spaceId: string): string | null {
  const { store } = useSyncEngine();

  return React.useMemo(() => {
    const blocksRel = reactiveRelations
      .get()
      .find(r => r.toEntity.id === blockEntityId && r.type.id === SystemIds.BLOCKS && !r.isDeleted);
    if (!blocksRel) return null;

    const blockRelEntity = store.getEntity(blocksRel.entityId, { spaceId });
    if (!blockRelEntity) return null;

    return blockRelEntity.relations.find(r => r.type.id === SystemIds.VIEW_PROPERTY)?.toEntity.id ?? null;
  }, [blockEntityId, spaceId, store]);
}

const VIEW_NAMES: Record<string, string> = {
  [SystemIds.TABLE_VIEW]: 'Table',
  [SystemIds.LIST_VIEW]: 'List',
  [SystemIds.GALLERY_VIEW]: 'Gallery',
  [SystemIds.BULLETED_LIST_VIEW]: 'Bulleted List',
};

type DataBlockCellProps = {
  block: BlockChange & { type: 'dataBlock' };
  side: 'before' | 'after';
  spaceId: string;
};

const DataBlockCell = ({ block, side, spaceId }: DataBlockCellProps) => {
  const dataBlock = block as DataBlockChange;
  const nameValue = side === 'before' ? dataBlock.before : dataBlock.after;
  const hasNameChange = dataBlock.before !== null || dataBlock.after !== null;
  const displayName = nameValue ?? dataBlock.blockName ?? 'Data Block';

  const allRelations = dataBlock.relations ?? [];
  const configValues = dataBlock.values ?? [];

  const viewRelations = allRelations.filter(r => r.typeId === SystemIds.VIEW_PROPERTY);
  const columnRelations = allRelations.filter(r => r.typeId === SystemIds.SHOWN_COLUMNS);
  const collectionItemRelations = allRelations.filter(
    r => r.typeId === SystemIds.COLLECTION_ITEM_RELATION_TYPE
  );
  const hasConfigChanges = allRelations.length > 0 || configValues.length > 0;

  const storeViewEntityId = useBlockViewEntityId(dataBlock.id, spaceId);
  const diffViewInfo = getViewInfo(viewRelations, side);
  const viewInfo = diffViewInfo ?? (storeViewEntityId
    ? { name: VIEW_NAMES[storeViewEntityId] ?? 'Table', entityId: storeViewEntityId }
    : { name: 'Table', entityId: SystemIds.TABLE_VIEW });
  const filterValue = getFilterValue(configValues, side);

  const hasViewChange = viewRelations.some(
    r => r.changeType === 'ADD' || r.changeType === 'REMOVE' || r.changeType === 'UPDATE'
  );
  const hasFilterChange = configValues.some(v => v.before !== v.after);
  const isFilterAdded = configValues.some(v => v.before === null && v.after !== null);
  const isFilterRemoved = configValues.some(v => v.before !== null && v.after === null);
  const hasColumnsChange = columnRelations.some(
    r => r.changeType === 'ADD' || r.changeType === 'REMOVE' || r.changeType === 'UPDATE'
  );
  const isColumnsAdded = columnRelations.every(r => r.changeType === 'ADD') && columnRelations.length > 0;
  const isColumnsRemoved = columnRelations.every(r => r.changeType === 'REMOVE') && columnRelations.length > 0;

  const isNew = dataBlock.before === null && dataBlock.after !== null;
  const isDeleted = dataBlock.before !== null && dataBlock.after === null;

  if (isNew && side === 'before') return <div />;
  if (isDeleted && side === 'after') return <div />;
  if (!hasNameChange && !hasConfigChanges) return <div />;

  return (
    <div
      className={cx(
        'flex flex-col overflow-hidden rounded-lg border border-grey-02 shadow-button',
        isNew && side === 'after' && 'ring-4 ring-added',
        isDeleted && side === 'before' && 'ring-4 ring-deleted'
      )}
    >
      <div className="flex items-center justify-between border-b border-grey-02 bg-white px-4 py-3">
        <div
          className={cx(
            'text-smallTitle font-semibold text-text',
            hasNameChange &&
              dataBlock.before !== dataBlock.after &&
              side === 'before' &&
              'rounded bg-deleted line-through decoration-1',
            hasNameChange && dataBlock.before !== dataBlock.after && side === 'after' && 'rounded bg-added'
          )}
        >
          {displayName}
        </div>

        <div className="flex items-center gap-2">
          {hasFilterChange && !(isFilterAdded && side === 'before') && !(isFilterRemoved && side === 'after') && (
            <Tooltip
              trigger={
                <div
                  className={cx(
                    'inline-flex cursor-help items-center gap-1.5 rounded border border-grey-02 bg-grey-01 px-2 py-1',
                    side === 'before' && 'ring-2 ring-deleted',
                    side === 'after' && 'ring-2 ring-added'
                  )}
                >
                  <span className="text-metadata text-grey-04">
                    {isFilterAdded ? 'Filter added' : isFilterRemoved ? 'Filter removed' : 'Filters changed'}
                  </span>
                </div>
              }
              label={
                <div className="max-w-[400px] text-left">
                  <div className="font-mono text-xs break-all whitespace-pre-wrap">
                    {filterValue ? formatJsonSafe(filterValue) : 'None'}
                  </div>
                </div>
              }
              position="top"
              variant="light"
            />
          )}

          {hasColumnsChange && !(isColumnsAdded && side === 'before') && !(isColumnsRemoved && side === 'after') && (
            <div
              className={cx(
                'inline-flex items-center gap-1.5 rounded border border-grey-02 bg-grey-01 px-2 py-1',
                side === 'before' && 'ring-2 ring-deleted',
                side === 'after' && 'ring-2 ring-added'
              )}
            >
              <span className="text-metadata text-grey-04">
                {isColumnsAdded ? 'Columns added' : isColumnsRemoved ? 'Columns removed' : 'Columns changed'}
              </span>
            </div>
          )}

          {viewInfo && (
            <div
              className={cx(
                'inline-flex items-center gap-1.5 rounded border border-grey-02 bg-grey-01 px-2 py-1',
                hasViewChange && side === 'before' && 'ring-2 ring-deleted',
                hasViewChange && side === 'after' && 'ring-2 ring-added'
              )}
            >
              <span className="text-metadata text-grey-04">{viewInfo.name}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 bg-grey-01 p-4">
        {collectionItemRelations.length > 0 ? (
          <DataBlockCollectionItems
            relations={collectionItemRelations}
            side={side}
            viewEntityId={viewInfo?.entityId ?? null}
          />
        ) : (
          <DataBlockViewSkeleton viewEntityId={viewInfo?.entityId ?? null} />
        )}
      </div>
    </div>
  );
};

type CollectionItem = {
  entityId: string;
  entityName: string | null | undefined;
  changeType: 'ADD' | 'REMOVE' | null;
};

function getCollectionItems(relations: RelationChange[], side: 'before' | 'after'): CollectionItem[] {
  const relevantTypes = side === 'before' ? ['REMOVE', 'UPDATE'] : ['ADD', 'UPDATE'];

  return relations.flatMap(r => {
    const snapshot = side === 'before' ? r.before : r.after;
    if (!snapshot || !relevantTypes.includes(r.changeType)) return [];
    return [
      {
        entityId: snapshot.toEntityId,
        entityName: snapshot.toEntityName,
        changeType: r.changeType === 'UPDATE' ? null : (r.changeType as 'ADD' | 'REMOVE'),
      },
    ];
  });
}

type DataBlockCollectionItemsProps = {
  relations: RelationChange[];
  side: 'before' | 'after';
  viewEntityId: string | null;
};

const DataBlockCollectionItems = ({ relations, side, viewEntityId }: DataBlockCollectionItemsProps) => {
  const items = getCollectionItems(relations, side);
  if (items.length === 0) return <div />;

  switch (viewEntityId) {
    case SystemIds.GALLERY_VIEW:
      return <CollectionGalleryItems items={items} />;
    case SystemIds.LIST_VIEW:
      return <CollectionListItems items={items} />;
    case SystemIds.BULLETED_LIST_VIEW:
      return <CollectionBulletedListItems items={items} />;
    case SystemIds.TABLE_VIEW:
    default:
      return <CollectionTableItems items={items} />;
  }
};

const HIGHLIGHT_CLASS_NAMES: Record<string, string> = {
  ADD: 'bg-added',
  REMOVE: 'bg-deleted line-through decoration-1',
};

const CollectionTableItems = ({ items }: { items: CollectionItem[] }) => (
  <div className="overflow-hidden rounded-lg border border-grey-02">
    <table className="w-full border-collapse bg-white" cellSpacing={0} cellPadding={0}>
      <thead>
        <tr className="border-b border-grey-02">
          <th className="p-[10px] text-left text-metadata font-medium text-grey-04">Name</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, i) => (
          <tr key={i} className="border-b border-grey-02 last:border-b-0">
            <td className="p-[10px]">
              <span className={cx('rounded text-body text-text', item.changeType && HIGHLIGHT_CLASS_NAMES[item.changeType])}>
                {item.entityName ?? item.entityId}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const CollectionGalleryItems = ({ items }: { items: CollectionItem[] }) => (
  <div className="grid grid-cols-2 gap-3">
    {items.map((item, i) => (
      <div
        key={i}
        className={cx('flex flex-col gap-2 rounded-[17px] p-[5px]', item.changeType && HIGHLIGHT_CLASS_NAMES[item.changeType])}
      >
        <div className="aspect-2/1 w-full rounded-lg bg-grey-02" />
        <div className="px-1">
          <div className="text-smallTitle font-medium text-text">{item.entityName ?? item.entityId}</div>
        </div>
      </div>
    ))}
  </div>
);

const CollectionListItems = ({ items }: { items: CollectionItem[] }) => (
  <div className="flex flex-col gap-2">
    {items.map((item, i) => (
      <div
        key={i}
        className={cx('flex items-start gap-6 rounded-[17px] p-1', item.changeType && HIGHLIGHT_CLASS_NAMES[item.changeType])}
      >
        <div className="h-16 w-16 shrink-0 rounded-lg bg-grey-02" />
        <div className="flex flex-col justify-center pt-2">
          <div className="text-smallTitle font-medium text-text">{item.entityName ?? item.entityId}</div>
        </div>
      </div>
    ))}
  </div>
);

const CollectionBulletedListItems = ({ items }: { items: CollectionItem[] }) => (
  <div className="flex flex-col gap-1">
    {items.map((item, i) => (
      <div key={i} className="flex gap-2 rounded-md px-1 py-0.5">
        <div className="mt-0.5 shrink-0 text-xl leading-none text-text">&bull;</div>
        <span className={cx('rounded text-body text-text', item.changeType && HIGHLIGHT_CLASS_NAMES[item.changeType])}>
          {item.entityName ?? item.entityId}
        </span>
      </div>
    ))}
  </div>
);

type ViewInfo = { name: string; entityId: string };

function getViewInfo(viewRelations: RelationChange[], side: 'before' | 'after'): ViewInfo | null {
  for (const r of viewRelations) {
    if (side === 'before' && (r.changeType === 'REMOVE' || r.changeType === 'UPDATE') && r.before) {
      return { name: r.before.toEntityName ?? 'Unknown', entityId: r.before.toEntityId };
    }
    if (side === 'after' && (r.changeType === 'ADD' || r.changeType === 'UPDATE') && r.after) {
      return { name: r.after.toEntityName ?? 'Unknown', entityId: r.after.toEntityId };
    }
  }
  return null;
}

function getFilterValue(configValues: ValueChange[], side: 'before' | 'after'): string | null {
  for (const v of configValues) {
    const val = side === 'before' ? v.before : v.after;
    if (val !== null) return val;
  }
  return null;
}

function formatJsonSafe(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

const DataBlockViewSkeleton = ({ viewEntityId }: { viewEntityId: string | null }) => {
  switch (viewEntityId) {
    case SystemIds.GALLERY_VIEW:
      return (
        <div className="grid grid-cols-2 gap-3 opacity-60">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-[17px] p-[5px]">
              <div className="aspect-2/1 w-full rounded-lg bg-grey-02" />
              <div className="h-5 w-3/4 rounded-sm bg-grey-02" />
              <div className="h-3 w-full rounded-sm bg-grey-02" />
              <div className="h-3 w-4/5 rounded-sm bg-grey-02" />
            </div>
          ))}
        </div>
      );
    case SystemIds.LIST_VIEW:
      return (
        <div className="space-y-2 opacity-60">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-start gap-6">
              <div className="h-16 w-16 shrink-0 rounded-[0.625rem] bg-grey-02" />
              <div className="flex flex-1 flex-col gap-2">
                <div className="h-5 w-32 rounded-sm bg-grey-02" />
                <div className="h-3 w-full rounded-sm bg-grey-02" />
                <div className="h-3 w-3/4 rounded-sm bg-grey-02" />
              </div>
            </div>
          ))}
        </div>
      );
    case SystemIds.BULLETED_LIST_VIEW:
      return (
        <div className="space-y-1 opacity-60">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-2">
              <div className="mt-1 shrink-0 text-xl leading-none text-grey-03">&bull;</div>
              <div className="h-5 w-48 rounded-sm bg-grey-02" />
            </div>
          ))}
        </div>
      );
    case SystemIds.TABLE_VIEW:
    default:
      return <TableBlockLoadingPlaceholder columns={3} rows={5} shimmer={false} />;
  }
};

type ValueChangeCellProps = {
  value: ValueChange;
  side: 'before' | 'after';
};

const ValueChangeCell = ({ value, side }: ValueChangeCellProps) => {
  const displayValue = side === 'before' ? value.before : value.after;
  const diff = value.type === 'TEXT' ? (value as TextValueChange).diff : undefined;

  if (displayValue === null) return null;

  return (
    <div className="mb-6 last:mb-0">
      <Text as="p" variant="bodySemibold">
        {value.propertyName ?? value.propertyId}
      </Text>
      <div>
        {value.type === 'TEXT' && diff ? (
          <TextDiffDisplay value={displayValue} diff={diff} side={side} />
        ) : value.type === 'BOOLEAN' ? (
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
              'inline-flex items-center gap-1 rounded border border-grey-02 px-1.5 py-0.5 text-metadata text-text tabular-nums',
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

  // Handle both '1'/'0' (local store format) and 'true'/'false' (API diff format)
  const checked = getChecked(value) ?? value === 'true';

  return (
    <span
      className={cx('inline-flex shrink-0 items-center rounded p-1', side === 'before' ? 'bg-deleted' : 'bg-added')}
    >
      <Checkbox checked={checked} disabled />
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
    <span
      suppressHydrationWarning
      className={cx('inline rounded', side === 'before' ? 'bg-deleted line-through decoration-1' : 'bg-added')}
    >
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
