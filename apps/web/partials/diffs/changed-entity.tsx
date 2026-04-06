'use client';

import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';
import { Effect } from 'effect';

import { getBatchEntities } from '~/core/io/queries';
import { hasMarkdownSyntax, renderMarkdownDocument, renderMarkdownInline } from '~/core/state/editor/markdown-render';
import { reactiveRelations } from '~/core/sync/store';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { SORT_PROPERTY } from '~/core/system-ids';
import type {
  BlockChange,
  DataBlockChange,
  DiffChunk,
  EntityDiff,
  RelationChange,
  TextValueChange,
  ValueChange,
} from '~/core/utils/diff/types';
import { formatSchedule } from '~/core/utils/schedule';
import {
  useEntityMediaUrl,
  useImageUrlFromEntity,
  usePdfUrlFromEntity,
  useVideoUrlFromEntity,
} from '~/core/utils/use-entity-media';
import { getImagePath, getVideoPath } from '~/core/utils/utils';

import { Checkbox, getChecked } from '~/design-system/checkbox';
import { NativeGeoImage } from '~/design-system/geo-image';
import { Text } from '~/design-system/text';
import { Tooltip } from '~/design-system/tooltip';

import { TableBlockLoadingPlaceholder } from '~/partials/blocks/table/table-block';

import { getFenceLength, readFencedCodeBlock } from './markdown-fences';

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
  const hasPdfRelations = nonSpecialRelations.some(r => r.after?.pdfUrl || r.before?.pdfUrl);
  const hasOtherRelations = nonSpecialRelations.some(
    r =>
      !r.after?.imageUrl &&
      !r.before?.imageUrl &&
      !r.after?.videoUrl &&
      !r.before?.videoUrl &&
      !r.after?.pdfUrl &&
      !r.before?.pdfUrl
  );

  const imageRelationPropertyIds = new Set(
    nonSpecialRelations.filter(r => r.after?.imageUrl || r.before?.imageUrl).map(r => r.typeId)
  );
  const videoRelationPropertyIds = new Set(
    nonSpecialRelations.filter(r => r.after?.videoUrl || r.before?.videoUrl).map(r => r.typeId)
  );
  const pdfRelationPropertyIds = new Set(
    nonSpecialRelations.filter(r => r.after?.pdfUrl || r.before?.pdfUrl).map(r => r.typeId)
  );
  const otherRelationPropertyIds = new Set(
    nonSpecialRelations
      .filter(
        r =>
          !r.after?.imageUrl &&
          !r.before?.imageUrl &&
          !r.after?.videoUrl &&
          !r.before?.videoUrl &&
          !r.after?.pdfUrl &&
          !r.before?.pdfUrl
      )
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
      !pdfRelationPropertyIds.has(v.propertyId) &&
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
    hasPdfRelations ||
    hasOtherRelations ||
    hasValues
  );
}

type ChangedEntityProps = {
  entity: EntityDiff;
  spaceId: string;
};

export const ChangedEntity = React.memo(function ChangedEntity({ entity, spaceId }: ChangedEntityProps) {
  const typeRelations = entity.relations.filter(r => r.typeId === TYPES_PROPERTY_ID);
  const avatarRelations = entity.relations.filter(r => r.typeId === AVATAR_PROPERTY_ID);
  const coverRelations = entity.relations.filter(r => r.typeId === COVER_PROPERTY_ID);

  const nonSpecialRelations = entity.relations.filter(
    r => r.typeId !== TYPES_PROPERTY_ID && r.typeId !== AVATAR_PROPERTY_ID && r.typeId !== COVER_PROPERTY_ID
  );
  const imageRelations = nonSpecialRelations.filter(r => r.after?.imageUrl || r.before?.imageUrl);
  const videoRelations = nonSpecialRelations.filter(r => r.after?.videoUrl || r.before?.videoUrl);
  const pdfRelations = nonSpecialRelations.filter(r => r.after?.pdfUrl || r.before?.pdfUrl);
  const otherRelations = nonSpecialRelations.filter(
    r =>
      !r.after?.imageUrl &&
      !r.before?.imageUrl &&
      !r.after?.videoUrl &&
      !r.before?.videoUrl &&
      !r.after?.pdfUrl &&
      !r.before?.pdfUrl
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
  const pdfRelationPropertyIds = new Set(pdfRelations.map(r => r.typeId));
  const otherRelationPropertyIds = new Set(otherRelations.map(r => r.typeId));
  const filteredOtherValues = otherValues.filter(
    v =>
      !imageRelationPropertyIds.has(v.propertyId) &&
      !videoRelationPropertyIds.has(v.propertyId) &&
      !pdfRelationPropertyIds.has(v.propertyId) &&
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
          videoRelations.length > 0 ||
          pdfRelations.length > 0) && (
          <div className="grid grid-cols-2 gap-20">
            {filteredOtherValues.some(v => v.before !== null) ||
            otherRelations.some(r => r.changeType === 'REMOVE' || r.changeType === 'UPDATE') ||
            imageRelations.some(r => r.changeType === 'REMOVE' || r.changeType === 'UPDATE') ||
            videoRelations.some(r => r.changeType === 'REMOVE' || r.changeType === 'UPDATE') ||
            pdfRelations.some(r => r.changeType === 'REMOVE' || r.changeType === 'UPDATE') ? (
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
                {groupRelationsByType(pdfRelations).map(([typeId, typeName, relations]) => (
                  <PdfPropertyCell
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
            videoRelations.some(r => r.changeType === 'ADD' || r.changeType === 'UPDATE') ||
            pdfRelations.some(r => r.changeType === 'ADD' || r.changeType === 'UPDATE') ? (
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
                {groupRelationsByType(pdfRelations).map(([typeId, typeName, relations]) => (
                  <PdfPropertyCell
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
});

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

type PdfPropertyCellProps = {
  typeName?: string | null;
  typeId: string;
  relations: RelationChange[];
  spaceId: string;
  side: 'before' | 'after';
};

const PdfPropertyCell = ({ typeName, typeId, relations, spaceId, side }: PdfPropertyCellProps) => {
  const url =
    side === 'before'
      ? (relations.find(r => r.before?.pdfUrl)?.before?.pdfUrl ?? null)
      : (relations.find(r => r.after?.pdfUrl)?.after?.pdfUrl ?? null);

  const afterEntityId = relations.find(r => r.after)?.after?.toEntityId;
  const localPdfUrl = usePdfUrlFromEntity(afterEntityId, spaceId);
  const resolvedUrl = side === 'after' ? (url ?? localPdfUrl ?? null) : url;

  if (resolvedUrl === null) return null;

  const ringClass = side === 'before' ? 'ring-2 ring-deleted' : 'ring-2 ring-added';
  const pdfSrc = getImagePath(resolvedUrl);

  return (
    <div className="mb-6 last:mb-0">
      <Text as="p" variant="bodySemibold">
        {typeName ?? typeId}
      </Text>
      <div className={cx('mt-1 h-[200px] w-[173px] overflow-hidden rounded-lg', ringClass)}>
        <embed src={pdfSrc} type="application/pdf" width="173" height="200" />
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
    case 'pdfBlock':
      return (
        <div className="grid grid-cols-2 gap-20">
          <PdfBlockCell block={block} side="before" />
          <PdfBlockCell block={block} side="after" />
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
  return (
    <>
      {renderMarkdownDocument(text, {
        textClassName: highlightClass,
        markClassName: highlightClass,
        codeBlockClassName: highlightClass ? 'rounded ring-2 ring-current' : undefined,
      })}
    </>
  );
};

type TextBlockCellProps = {
  block: BlockChange & { type: 'textBlock' };
  side: 'before' | 'after';
};

function isStandaloneRenderableImageUrl(s: string): boolean {
  const t = s.trim();
  if (t.startsWith('ipfs://')) return true;
  if (t.startsWith('http://') || t.startsWith('https://')) {
    return /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(t) || /\/ipfs\//i.test(t);
  }
  return false;
}

function isStandaloneRenderableVideoUrl(s: string): boolean {
  const t = s.trim();
  if (t.startsWith('http://') || t.startsWith('https://')) {
    return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(t);
  }
  if (t.startsWith('ipfs://')) {
    return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(t);
  }
  return false;
}

const TextBlockCell = ({ block, side }: TextBlockCellProps) => {
  const value = side === 'before' ? block.before : block.after;

  if (value === null) {
    return <div />;
  }

  const trimmed = value.trim();
  if (isStandaloneRenderableImageUrl(trimmed)) {
    const ringClass = side === 'before' ? 'ring-4 ring-deleted' : 'ring-4 ring-added';
    return (
      <div className={cx('aspect-video w-full overflow-hidden rounded bg-grey-01', ringClass)}>
        <NativeGeoImage value={trimmed} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }
  if (isStandaloneRenderableVideoUrl(trimmed)) {
    const ringClass = side === 'before' ? 'ring-4 ring-deleted' : 'ring-4 ring-added';
    const videoSrc = getVideoPath(trimmed);
    return (
      <div className={cx('aspect-video w-full overflow-hidden rounded bg-grey-01', ringClass)}>
        <video src={videoSrc} controls className="h-full w-full object-cover" />
      </div>
    );
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
  if (!hasMarkdownSyntax(fullText)) {
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

  /** Advance the chunk cursor through `count` characters without emitting any nodes. */
  const skipChars = (count: number) => {
    charIndex += count;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (i > 0) {
      charIndex++;
    }

    // Code block (``` ... ```)
    if (getFenceLength(line)) {
      const block = readFencedCodeBlock(lines, i);
      if (!block) {
        i++;
        continue;
      }

      skipChars(block.openingLine.length);

      if (block.codeText.length > 0) {
        charIndex++;
      }

      const codeNodes = getStyledText(block.codeText);
      const codeLinesArray = block.codeText.split('\n');
      elements.push(
        <div key={`code-${i}`} className="code-block">
          <div className="code-block-line-numbers" aria-hidden>
            {codeLinesArray.map((_, idx) => (
              <div key={idx}>{idx + 1}</div>
            ))}
          </div>
          <code>{codeNodes}</code>
        </div>
      );

      if (block.closingLine) {
        charIndex++;
        skipChars(block.closingLine.length);
      }

      i = block.nextIndex - 1;
      continue;
    }

    /** Apply inline mark rendering (code, math) to unchanged diff spans. */
    const applyInlineMarks = (nodes: React.ReactNode[]): React.ReactNode[] => {
      return nodes.map((node, idx) => {
        if (React.isValidElement<{ className?: string; children?: React.ReactNode }>(node)) {
          const { className, children } = node.props;
          if (!className && typeof children === 'string' && hasMarkdownSyntax(children)) {
            return <React.Fragment key={`im-${idx}`}>{renderMarkdownInline(children)}</React.Fragment>;
          }
        }
        return node;
      });
    };

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      charIndex += headingMatch[1].length + 1;
      elements.push(
        <div key={i} className="react-renderer node-heading">
          {renderHeading(level, applyInlineMarks(getStyledText(headingMatch[2])))}
        </div>
      );
      charIndex += headingMatch[2].length;
      continue;
    }

    const unorderedListMatch = line.match(/^([-*])\s+(.+)$/);
    if (unorderedListMatch) {
      charIndex += 2;
      elements.push(
        <ul key={`ul-${i}`}>
          <li>
            <div className="react-renderer node-paragraph">
              <div className="whitespace-normal">
                <p>{applyInlineMarks(getStyledText(unorderedListMatch[2]))}</p>
              </div>
            </div>
          </li>
        </ul>
      );
      charIndex += unorderedListMatch[2].length;
      continue;
    }

    const orderedListMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (orderedListMatch) {
      const prefixLen = orderedListMatch[1].length + 2; // "1. " = digit + dot + space
      charIndex += prefixLen;
      elements.push(
        <ol key={`ol-${i}`} start={Number(orderedListMatch[1])}>
          <li>
            <div className="react-renderer node-paragraph">
              <div className="whitespace-normal">
                <p>{applyInlineMarks(getStyledText(orderedListMatch[2]))}</p>
              </div>
            </div>
          </li>
        </ol>
      );
      charIndex += orderedListMatch[2].length;
      continue;
    }

    if (line.trim()) {
      elements.push(
        <div key={i} className="react-renderer node-paragraph">
          <div className="whitespace-normal">
            <p>{applyInlineMarks(getStyledText(line))}</p>
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

type PdfBlockCellProps = {
  block: BlockChange & { type: 'pdfBlock' };
  side: 'before' | 'after';
};

const PdfBlockCell = ({ block, side }: PdfBlockCellProps) => {
  const value = side === 'before' ? block.before : block.after;

  if (value === null) {
    return <div />;
  }

  const ringClass = side === 'before' ? 'ring-4 ring-deleted' : 'ring-4 ring-added';
  const pdfSrc = getImagePath(value);

  return (
    <div className={cx('flex h-[200px] w-[173px] overflow-hidden rounded bg-grey-01', ringClass)}>
      <embed src={pdfSrc} type="application/pdf" width="173" height="200" />
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
  [SystemIds.TABLE_VIEW]: 'Table view',
  [SystemIds.LIST_VIEW]: 'List view',
  [SystemIds.GALLERY_VIEW]: 'Gallery view',
  [SystemIds.BULLETED_LIST_VIEW]: 'Bulleted List view',
};

function isUuidForEntityBatch(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  const h = id.replace(/-/g, '').toLowerCase();
  return h.length === 32 && /^[0-9a-f]+$/.test(h);
}

function maybeAddEntityBatchId(ids: Set<string>, raw: unknown): void {
  if (typeof raw === 'string' && isUuidForEntityBatch(raw)) ids.add(raw);
}

function extractEntityIdsFromConfigValues(configValues: ValueChange[]): string[] {
  const ids = new Set<string>();

  const extractFromSortJson = (raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      maybeAddEntityBatchId(ids, parsed.sort_by);
    } catch {
      // ignore
    }
  };

  const extractFromFilterJson = (raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.filter) {
        for (const [key, filterValue] of Object.entries(parsed.filter as Record<string, unknown>)) {
          if (key !== '_relation') maybeAddEntityBatchId(ids, key);
          if (filterValue && typeof filterValue === 'object') {
            const fv = filterValue as Record<string, unknown>;
            maybeAddEntityBatchId(ids, fv.is);
            if (Array.isArray(fv.in))
              fv.in.forEach((v: unknown) => {
                maybeAddEntityBatchId(ids, v);
              });
            if (
              fv.fromEntity &&
              typeof fv.fromEntity === 'object' &&
              typeof (fv.fromEntity as Record<string, unknown>).is === 'string'
            )
              maybeAddEntityBatchId(ids, (fv.fromEntity as Record<string, unknown>).is);
            if (fv.type && typeof fv.type === 'object' && typeof (fv.type as Record<string, unknown>).is === 'string')
              maybeAddEntityBatchId(ids, (fv.type as Record<string, unknown>).is);
          }
        }
      }
      if (parsed.spaceId?.in && Array.isArray(parsed.spaceId.in)) {
        parsed.spaceId.in.forEach((v: unknown) => {
          maybeAddEntityBatchId(ids, v);
        });
      }
    } catch {
      // not JSON, skip
    }
  };

  for (const v of configValues) {
    const extract = v.propertyId === SORT_PROPERTY ? extractFromSortJson : extractFromFilterJson;
    if (v.before) extract(v.before);
    if (v.after) extract(v.after);
  }

  return [...ids];
}

function useConfigNameMap(configValues: ValueChange[]) {
  const entityIds = React.useMemo(() => extractEntityIdsFromConfigValues(configValues), [configValues]);
  const validIds = React.useMemo(() => entityIds.filter(isUuidForEntityBatch), [entityIds]);
  const key = validIds.sort().join(',');

  const { data: nameMap = new Map<string, string>() } = useQuery({
    queryKey: ['config-entity-names', key],
    enabled: validIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const entities = await Effect.runPromise(getBatchEntities(validIds));
      const map = new Map<string, string>();
      for (const e of entities) {
        if (e.name) map.set(e.id, e.name);
      }
      return map;
    },
  });

  return nameMap;
}

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
  const allConfigValues = dataBlock.values ?? [];
  const filterValues = allConfigValues.filter(v => v.propertyId !== SORT_PROPERTY);
  const sortValues = allConfigValues.filter(v => v.propertyId === SORT_PROPERTY);
  const nameMap = useConfigNameMap(allConfigValues);

  const viewRelations = allRelations.filter(r => r.typeId === SystemIds.VIEW_PROPERTY);
  const columnRelations = allRelations.filter(r => r.typeId === SystemIds.SHOWN_COLUMNS);
  const collectionItemRelations = allRelations.filter(r => r.typeId === SystemIds.COLLECTION_ITEM_RELATION_TYPE);
  const hasConfigChanges = allRelations.length > 0 || allConfigValues.length > 0;

  const storeViewEntityId = useBlockViewEntityId(dataBlock.id, spaceId);
  const diffViewInfo = getViewInfo(viewRelations, side);
  const viewInfo =
    diffViewInfo ??
    (storeViewEntityId
      ? { name: VIEW_NAMES[storeViewEntityId] ?? 'Table', entityId: storeViewEntityId }
      : { name: 'Table', entityId: SystemIds.TABLE_VIEW });
  const filterValue = getFilterValue(filterValues, side);

  const hasViewChange = viewRelations.some(
    r => r.changeType === 'ADD' || r.changeType === 'REMOVE' || r.changeType === 'UPDATE'
  );
  const hasFilterChange = filterValues.some(v => (v.before || null) !== (v.after || null));
  const isFilterAdded = filterValues.some(v => !v.before && !!v.after);
  const isFilterRemoved = filterValues.some(v => !!v.before && !v.after);
  const hasSortChange = sortValues.some(v => (v.before || null) !== (v.after || null));
  const isSortAdded = sortValues.some(v => !v.before && !!v.after);
  const isSortRemoved = sortValues.some(v => !!v.before && !v.after);
  const sortValue = getSortValue(sortValues, side);
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
                  <div className="text-xs break-all whitespace-pre-wrap">
                    {filterValue ? formatFilterDisplay(filterValue, nameMap) : 'None'}
                  </div>
                </div>
              }
              position="top"
              variant="light"
            />
          )}

          {hasSortChange && !(isSortAdded && side === 'before') && !(isSortRemoved && side === 'after') && (
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
                    {isSortAdded ? 'Sort added' : isSortRemoved ? 'Sort removed' : 'Sort changed'}
                  </span>
                </div>
              }
              label={
                <div className="max-w-[400px] text-left">
                  <div className="text-xs break-all whitespace-pre-wrap">
                    {sortValue ? formatSortDisplay(sortValue, nameMap) : 'None'}
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
              <span
                className={cx('rounded text-body text-text', item.changeType && HIGHLIGHT_CLASS_NAMES[item.changeType])}
              >
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
        className={cx(
          'flex flex-col gap-2 rounded-[17px] p-[5px]',
          item.changeType && HIGHLIGHT_CLASS_NAMES[item.changeType]
        )}
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
        className={cx(
          'flex items-start gap-6 rounded-[17px] p-1',
          item.changeType && HIGHLIGHT_CLASS_NAMES[item.changeType]
        )}
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
      return {
        name: VIEW_NAMES[r.before.toEntityId] ?? r.before.toEntityName ?? 'Unknown',
        entityId: r.before.toEntityId,
      };
    }
    if (side === 'after' && (r.changeType === 'ADD' || r.changeType === 'UPDATE') && r.after) {
      return {
        name: VIEW_NAMES[r.after.toEntityId] ?? r.after.toEntityName ?? 'Unknown',
        entityId: r.after.toEntityId,
      };
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

function getSortValue(sortValues: ValueChange[], side: 'before' | 'after'): string | null {
  for (const v of sortValues) {
    const val = side === 'before' ? v.before : v.after;
    if (val !== null && val !== '') return val;
  }
  return null;
}

function formatSortDisplay(value: string, nameMap: Map<string, string>): string {
  try {
    const parsed = JSON.parse(value);
    const direction = parsed.sort_direction === 'ascending' ? 'Ascending' : 'Descending';
    const columnId = parsed.sort_by ?? 'unknown';
    const columnName = nameMap.get(columnId) ?? columnId;
    return `${columnName}, ${direction}`;
  } catch {
    return value;
  }
}

function formatFilterDisplay(value: string, nameMap: Map<string, string>): string {
  try {
    const parsed = JSON.parse(value);
    const lines: string[] = [];

    if (parsed.mode === 'OR') lines.push('Mode: OR');

    if (parsed.spaceId?.in && Array.isArray(parsed.spaceId.in)) {
      const spaceNames = parsed.spaceId.in.map((id: string) => nameMap.get(id) ?? id);
      lines.push(`Space: ${spaceNames.join(', ')}`);
    }

    if (parsed.filter) {
      for (const [key, filterValue] of Object.entries(parsed.filter as Record<string, unknown>)) {
        if (!filterValue || typeof filterValue !== 'object') continue;
        const fv = filterValue as Record<string, unknown>;

        if (key === '_relation') {
          if (fv.fromEntity && typeof fv.fromEntity === 'object') {
            const entityId = (fv.fromEntity as Record<string, unknown>).is as string;
            const typeId =
              fv.type && typeof fv.type === 'object' ? ((fv.type as Record<string, unknown>).is as string) : '';
            const entityName = nameMap.get(entityId) ?? entityId;
            const typeName = typeId ? (nameMap.get(typeId) ?? typeId) : '';
            lines.push(`Backlink: ${entityName}${typeName ? ` (${typeName})` : ''}`);
          } else if (fv.type && typeof fv.type === 'object') {
            const typeId = (fv.type as Record<string, unknown>).is as string;
            lines.push(`Relation type: ${nameMap.get(typeId) ?? typeId}`);
          }
        } else {
          const propName = nameMap.get(key) ?? key;
          if (typeof fv.is === 'string') {
            lines.push(`${propName}: ${nameMap.get(fv.is) ?? fv.is}`);
          } else if (Array.isArray(fv.in)) {
            const values = fv.in.map((v: string) => nameMap.get(v) ?? v);
            lines.push(`${propName}: ${values.join(', ')}`);
          }
        }
      }
    }

    return lines.length > 0 ? lines.join('\n') : 'No filters';
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
        ) : value.type === 'SCHEDULE' ? (
          <ScheduleDisplay value={displayValue} side={side} />
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

type ScheduleDisplayProps = {
  value: string | null;
  side: 'before' | 'after';
};

const ScheduleDisplay = ({ value, side }: ScheduleDisplayProps) => {
  if (value === null) return null;

  const displayValue = formatSchedule(value);

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
