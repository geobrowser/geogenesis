'use client';

import { Graph, SystemIds } from '@geoprotocol/geo-sdk';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { Node, NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer, mergeAttributes } from '@tiptap/react';

import * as React from 'react';
import { useRef, useState } from 'react';

import {
  MAX_VIDEO_SIZE_BYTES,
  VALID_VIDEO_TYPES,
  VIDEO_ACCEPT,
  VIDEO_BLOCK_TYPE,
  VIDEO_URL_PROPERTY,
} from '~/core/constants';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { useEditorInstance } from '~/core/state/editor/editor-provider';
import { storage } from '~/core/sync/use-mutate';
import { useHydrateEntity, useRelations, useValues } from '~/core/sync/use-store';
import { getVideoPath } from '~/core/utils/utils';

import { Close } from '~/design-system/icons/close';
import { CloseSmall } from '~/design-system/icons/close-small';
import { Context } from '~/design-system/icons/context';
import { Copy } from '~/design-system/icons/copy';
import { Trash } from '~/design-system/icons/trash';
import { Upload } from '~/design-system/icons/upload';
import { VideoSmall } from '~/design-system/icons/video-small';
import { MenuItem } from '~/design-system/menu';

export const VideoNode = Node.create({
  name: 'video',
  group: 'block',
  atom: true,
  spanning: false,
  allowGapCursor: false,
  defining: true,
  exitable: true,

  // Note: id and spaceId are defined by id-extension as global attributes
  // We only define video-specific attributes here
  addAttributes() {
    return {
      src: {
        default: '',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'video-node',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['video-node', mergeAttributes(HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoNodeComponent);
  },
});

function VideoNodeComponent({ node, deleteNode }: NodeViewProps) {
  const { spaceId } = useEditorInstance();
  const { id } = node.attrs;

  return (
    <NodeViewWrapper>
      <div contentEditable="false" className="video-node my-4">
        <VideoNodeChildren spaceId={spaceId} entityId={id} onRemove={deleteNode} />
      </div>
    </NodeViewWrapper>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}b`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}kb`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}mb`;
}

function VideoNodeChildren({
  spaceId,
  entityId,
  onRemove,
}: {
  spaceId: string;
  entityId: string;
  onRemove: () => void;
}) {
  // Hydrate the video block entity from remote to populate the reactive store
  useHydrateEntity({ id: entityId });

  const isEditing = useUserIsEditing(spaceId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadFileSize, setUploadFileSize] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Read the name from the store
  const nameValues = useValues({
    selector: v => v.entity.id === entityId && v.property.id === SystemIds.NAME_PROPERTY && v.spaceId === spaceId,
  });
  const storedName = nameValues?.[0]?.value ?? '';

  // Read the video URL from the store
  const videoUrlValues = useValues({
    selector: v => v.entity.id === entityId && v.property.id === VIDEO_URL_PROPERTY && v.spaceId === spaceId,
  });
  const storedVideoUrl = videoUrlValues?.[0]?.value ?? '';

  // Read the Types relation (to VIDEO_BLOCK_TYPE) for deletion
  const typeRelations = useRelations({
    selector: r =>
      r.fromEntity.id === entityId &&
      r.type.id === SystemIds.TYPES_PROPERTY &&
      r.toEntity.id === VIDEO_BLOCK_TYPE &&
      r.spaceId === spaceId,
  });

  const [localName, setLocalName] = useState(storedName);

  // Update local state when stored name changes
  React.useEffect(() => {
    setLocalName(storedName);
  }, [storedName]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalName(e.target.value);
  };

  const handleNameBlur = () => {
    if (localName !== storedName) {
      storage.entities.name.set(entityId, spaceId, localName);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsUploading(false);
    setUploadProgress(0);
    setUploadFileName('');
    setUploadFileSize(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadFile = async (file: File) => {
    // Check file type
    if (!VALID_VIDEO_TYPES.includes(file.type)) {
      setUploadError('Invalid file type. Please upload MP4, MOV, AVI, WMV, WebM, or FLV.');
      return;
    }

    // Check file size (100MB limit)
    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      setUploadError('File size exceeds 100MB limit');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    setUploadFileName(file.name.replace(/\.[^/.]+$/, '')); // Remove extension
    setUploadFileSize(file.size);

    abortControllerRef.current = new AbortController();

    // Track progress interval for cleanup
    let progressInterval: NodeJS.Timeout | undefined;

    try {
      // Simulate progress while uploading
      progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 2, 90));
      }, 300);

      // Upload using Graph.createImage (works for video too)
      const { ops } = await Graph.createImage({
        blob: file,
        network: 'TESTNET',
      });

      setUploadProgress(100);

      // Extract the IPFS URL from the ops (new SDK format)
      let ipfsUrl: string | undefined;
      for (const op of ops) {
        if (op.type === 'createEntity') {
          // Type assertion for new SDK format
          const values = (op as unknown as { values: Array<{ value: { type: string; value?: string } }> }).values;
          const ipfsValue = values?.find(pv => {
            const val = pv.value?.value;
            return typeof val === 'string' && val.startsWith('ipfs://');
          });
          if (ipfsValue) {
            ipfsUrl = ipfsValue.value?.value;
            break;
          }
        }
      }

      if (ipfsUrl) {
        // Save the video URL to the store
        storage.values.set({
          id: ID.createValueId({
            entityId,
            propertyId: VIDEO_URL_PROPERTY,
            spaceId,
          }),
          entity: { id: entityId, name: null },
          property: { id: VIDEO_URL_PROPERTY, name: 'Video URL', dataType: 'TEXT' },
          spaceId,
          value: ipfsUrl,
        });

        // Auto-set the name to the filename if no name is set
        const fileName = file.name.replace(/\.[^/.]+$/, ''); // Remove extension
        if (!storedName) {
          storage.entities.name.set(entityId, spaceId, fileName);
          setLocalName(fileName);
        }
      } else {
        // IPFS URL extraction failed - show error to user
        console.error('Failed to extract IPFS URL from upload response');
        setUploadError('Upload succeeded but failed to process video URL. Please try again.');
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Video upload failed:', error);
        setUploadError('Failed to upload video. Please try again.');
      }
    } finally {
      // Always clear the progress interval to prevent memory leak
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      setIsUploading(false);
      abortControllerRef.current = null;
      // Reset the input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await uploadFile(file);
  };

  const onCopyBlockId = async () => {
    try {
      await navigator.clipboard.writeText(entityId);
      setIsMenuOpen(false);
    } catch (err) {
      console.error('Failed to copy video block entity ID for: ', entityId);
    }
  };

  const onRemoveBlock = () => {
    setIsMenuOpen(false);

    // Delete the video URL value
    const videoUrlValue = videoUrlValues?.[0];
    if (videoUrlValue) {
      storage.values.delete(videoUrlValue);
    }

    // Delete the name value
    const nameValue = nameValues?.[0];
    if (nameValue) {
      storage.values.delete(nameValue);
    }

    // Delete the Types relation (VIDEO_BLOCK_TYPE)
    const typeRelation = typeRelations?.[0];
    if (typeRelation) {
      storage.relations.delete(typeRelation);
    }

    // Remove the node from the editor (this triggers upsertEditorState which handles block relation deletion)
    onRemove();
  };

  const hasVideo = Boolean(storedVideoUrl);
  const videoSrc = hasVideo ? getVideoPath(storedVideoUrl) : '';
  const uploadedBytes = Math.floor((uploadProgress / 100) * uploadFileSize);

  return (
    <div className="flex flex-col overflow-hidden rounded-lg">
      {/* Title and context menu */}
      <div className="flex items-center justify-between px-4 pb-2">
        <input
          type="text"
          value={localName}
          onChange={handleNameChange}
          onBlur={handleNameBlur}
          placeholder="Video title..."
          readOnly={!isEditing}
          className="flex-1 bg-transparent text-mediumTitle text-text placeholder:text-grey-03 focus:outline-none"
        />
        <Dropdown.Root open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <Dropdown.Trigger className="ml-2 flex h-6 w-6 items-center justify-center rounded hover:bg-grey-01">
            {isMenuOpen ? <Close color="grey-04" /> : <Context color="grey-04" />}
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Content
              sideOffset={8}
              className="z-[1001] block w-[200px] overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg"
              align="end"
            >
              <MenuItem onClick={onCopyBlockId}>
                <span className="flex w-full items-center justify-between">
                  <span>Copy block ID</span>
                  <Copy color="grey-04" />
                </span>
              </MenuItem>
              {isEditing && (
                <MenuItem onClick={onRemoveBlock}>
                  <span className="flex w-full items-center justify-between">
                    <span>Remove</span>
                    <Trash color="grey-04" />
                  </span>
                </MenuItem>
              )}
            </Dropdown.Content>
          </Dropdown.Portal>
        </Dropdown.Root>
      </div>

      {/* Video content or upload UI */}
      {hasVideo ? (
        <div className="relative">
          <video src={videoSrc} controls className="w-full rounded-lg" />
        </div>
      ) : isEditing ? (
        <div
          className={`flex min-h-[200px] flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-grey-02 p-8 transition-colors ${
            isDragging ? 'bg-ctaPrimary/10' : ''
          }`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <input ref={fileInputRef} type="file" accept={VIDEO_ACCEPT} onChange={handleFileSelect} className="hidden" />

          {isUploading ? (
            <div className="flex w-full max-w-md flex-col items-center">
              <p className="mb-1 text-sm text-grey-04">Uploading</p>
              <p className="mb-3 text-lg font-medium text-text">{uploadFileName}</p>
              <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-grey-02">
                <div
                  className="h-full bg-ctaPrimary transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <div className="flex w-full items-center justify-between">
                <p className="text-sm text-grey-04">
                  {uploadProgress}% {formatFileSize(uploadedBytes)} of {formatFileSize(uploadFileSize)}
                </p>
                <button
                  onClick={handleCancelUpload}
                  className="flex h-6 w-6 items-center justify-center rounded hover:bg-grey-01"
                >
                  <CloseSmall color="grey-04" />
                </button>
              </div>
            </div>
          ) : isDragging ? (
            <div className="flex flex-col items-center">
              <div
                className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg"
                style={{ backgroundColor: '#002FD924' }}
              >
                <VideoSmall color="#002FD9" />
              </div>
              <p className="text-lg font-medium text-ctaPrimary">Drop video here</p>
            </div>
          ) : (
            <>
              <div
                className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg"
                style={{ backgroundColor: '#002FD924' }}
              >
                <VideoSmall color="#002FD9" />
              </div>
              <p
                className="mb-1 font-semibold text-text"
                style={{ fontSize: '19px', lineHeight: '21px', letterSpacing: '-0.5px' }}
              >
                Drag & drop or select a file
              </p>
              <p className="mb-4 text-grey-04" style={{ fontSize: '14px', lineHeight: '12px', letterSpacing: '0px' }}>
                Max 100mb · MP4, MOV, AVI, WMV, WebM, or FLV
              </p>
              <button
                onClick={handleUploadClick}
                className="flex items-center gap-2 rounded-md border border-grey-02 px-3 py-1.5 text-text transition-colors hover:bg-grey-01"
              >
                <Upload />
                Select file
              </button>
              {uploadError && <p className="text-red-500 mt-4 text-sm">{uploadError}</p>}
            </>
          )}
        </div>
      ) : (
        <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-grey-02 p-8">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-divider">
            <VideoSmall color="grey-04" />
          </div>
          <p className="text-sm text-grey-04">No video</p>
        </div>
      )}
    </div>
  );
}
